/**
 * OpenCode provider adapter — server-only.
 *
 * Implements the MAXXEN `ProviderAdapter` seam (lib/ai/types) against
 * OpenCode's DOCUMENTED inference endpoints only:
 *   openai-chat      -> POST https://opencode.ai/inference/openai/v1/chat/completions (SSE)
 *   openai-responses -> POST https://opencode.ai/inference/openai/v1/responses (SSE)
 *   anthropic        -> POST https://opencode.ai/inference/anthropic/v1/messages (SSE)
 *   gemini           -> POST https://opencode.ai/inference/google/v1beta/models/<m>:streamGenerateContent (SSE)
 *
 * Auth: per the inference guide, "Free chat models can be called without [the
 * auth] header. Paid models require it." The adapter therefore sends NO
 * Authorization header for keyless free-model calls, and the caller's own
 * OpenCode key (Bearer, from Maxxen Settings — never from any OpenCode local
 * state) otherwise. A paid model selected without a key fails closed with a
 * clear "authentication required" ProviderError BEFORE any request is sent, so
 * a paid request can never be attempted anonymously by accident.
 *
 * The request baseURL is IGNORED by design: endpoints are pinned to the
 * documented origin so a crafted client baseURL cannot redirect the call.
 * Streaming is true SSE forwarding into ModelEvents (no buffering the full
 * response), with cancellation via the request signal and a 60s idle guard.
 */
import {
  OPENCODE_ANTHROPIC_URL,
  OPENCODE_CHAT_URL,
  OPENCODE_GEMINI_URL,
  OPENCODE_RESPONSES_URL,
  familyForModelId,
  modelNeedsKey,
  normalizeUpstreamError,
  type OpenCodeApiFamily,
} from "./opencode-catalog";
import { anthropicCapabilities, openAICompatibleCapabilities } from "../capabilities";
import {
  ProviderError,
  type CapabilityDescriptor,
  type ModelEvent,
  type ModelRequest,
  type ProviderAdapter,
} from "../types";

const UPSTREAM_TIMEOUT_MS = 60_000;

function opencodeCapabilities(model: string): CapabilityDescriptor {
  // OpenAI-chat family: the agent loop's function-calling is implemented and
  // verified against this family. Other families stream chat only.
  return familyForModelId(model) === "openai-chat"
    ? openAICompatibleCapabilities()
    : anthropicCapabilities();
}

function withTimeout(upstream: AbortSignal | undefined): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  // No unref(): DOM-typed setTimeout returns a number; the timer is cleared
  // via cancel() on every settle path, and fires harmlessly otherwise.
  const timer = setTimeout(() => ctrl.abort(new Error("OpenCode request timed out.")), UPSTREAM_TIMEOUT_MS);
  const onAbort = () => {
    clearTimeout(timer);
    ctrl.abort(upstream?.reason);
  };
  upstream?.addEventListener("abort", onAbort, { once: true });
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

function headers(apiKey: string): Record<string, string> {
  // No header at all for keyless free calls (docs: free models need none).
  const h: Record<string, string> = { "content-type": "application/json" };
  if (apiKey.trim()) h["authorization"] = `Bearer ${apiKey.trim()}`;
  return h;
}

async function postSSE(
  url: string,
  body: unknown,
  apiKey: string,
  signal: AbortSignal
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  let upstream: Response;
  try {
    upstream = await fetch(url, { method: "POST", headers: headers(apiKey), body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw new ProviderError("Request cancelled.", undefined);
    const raw = e instanceof Error ? e.message : "Upstream unreachable";
    const timedOut = /timed out|timeout|aborted/i.test(raw);
    throw new ProviderError(
      timedOut ? "OpenCode request timed out. Try again." : `Cannot reach OpenCode (${raw}). Check your connection.`,
      undefined
    );
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "").then((t) => t.slice(0, 300));
    const { message, retryable } = normalizeUpstreamError(upstream.status, detail);
    const err = new ProviderError(message, upstream.status);
    (err as { retryable?: boolean }).retryable = retryable;
    throw err;
  }
  return upstream.body.getReader();
}

/** Shared SSE frame pump: split on blank lines, parse `data:` JSON, extract text. */
async function* pumpSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  extract: (ev: unknown) => string | null,
  signal: AbortSignal | undefined
): AsyncGenerator<ModelEvent> {
  const decoder = new TextDecoder();
  let buf = "";
  let sawAny = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) return;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let ev: unknown;
          try {
            ev = JSON.parse(payload);
          } catch {
            continue; // partial frame — wait for more
          }
          const text = extract(ev);
          if (typeof text === "string" && text) {
            sawAny = true;
            yield { type: "delta", text };
          }
        }
      }
    }
    if (!sawAny) {
      yield { type: "delta", text: "MAXXEN returned an empty response. Retry, or switch models." };
    }
  } catch (e) {
    if (!(signal?.aborted || (e as Error)?.name === "AbortError")) {
      yield { type: "delta", text: "\n\nConnection to the model dropped mid-answer." };
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
  // An aborted stream ends silently: no terminal event after cancellation.
  if (signal?.aborted) return;
  yield { type: "done" };
}

type Msg = { role: string; content: string };

function toMessages(system: string | undefined, messages: Msg[]): Msg[] {
  return system ? [{ role: "system", content: system }, ...messages] : [...messages];
}

// --- Family delta extractors (pure: unit-tested without network) --------------

export function extractChatDelta(ev: unknown): string | null {
  const c = (ev as { choices?: { delta?: { content?: unknown } }[] })?.choices?.[0]?.delta?.content;
  return typeof c === "string" && c ? c : null;
}

export function extractResponsesDelta(ev: unknown): string | null {
  const o = ev as { type?: unknown; delta?: unknown; text?: unknown };
  // Responses SSE: { type: "response.output_text.delta", delta: "..." }.
  if (o?.type === "response.output_text.delta" && typeof o.delta === "string" && o.delta) return o.delta;
  // Defensive: some gateways forward { delta: "..." } shapes.
  if (typeof o?.delta === "string" && o.delta) return o.delta;
  return null;
}

export function extractAnthropicDelta(ev: unknown): string | null {
  const o = ev as { type?: unknown; delta?: { text?: unknown } };
  // Messages SSE: { type: "content_block_delta", delta: { text } }.
  if (o?.type === "content_block_delta" && typeof o?.delta?.text === "string" && o.delta.text) {
    return o.delta.text;
  }
  return null;
}

export function extractGeminiDelta(ev: unknown): string | null {
  const parts = (ev as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  return text || null;
}

/**
 * Each starter awaits postSSE EAGERLY, so immediate upstream failures (auth,
 * unknown model, rate limit) throw inside complete() — preserving the adapter
 * contract — instead of surfacing mid-stream. The returned generator only
 * pumps the already-accepted stream.
 */
async function startChat(
  request: ModelRequest,
  key: string,
  ctx: { signal: AbortSignal; cancel: () => void }
): Promise<AsyncGenerator<ModelEvent>> {
  const reader = await postSSE(
    OPENCODE_CHAT_URL,
    {
      model: request.model,
      messages: toMessages(request.system, request.messages as Msg[]),
      temperature: request.temperature ?? 0.7,
      stream: true,
    },
    key,
    ctx.signal
  ).catch((e) => {
    ctx.cancel();
    throw e;
  });
  return pumpSSE(reader, extractChatDelta, ctx.signal);
}

async function startResponses(
  request: ModelRequest,
  key: string,
  ctx: { signal: AbortSignal; cancel: () => void }
): Promise<AsyncGenerator<ModelEvent>> {
  const reader = await postSSE(
    OPENCODE_RESPONSES_URL,
    {
      model: request.model,
      input: toMessages(request.system, request.messages as Msg[]),
      stream: true,
    },
    key,
    ctx.signal
  ).catch((e) => {
    ctx.cancel();
    throw e;
  });
  return pumpSSE(reader, extractResponsesDelta, ctx.signal);
}

async function startAnthropic(
  request: ModelRequest,
  key: string,
  ctx: { signal: AbortSignal; cancel: () => void }
): Promise<AsyncGenerator<ModelEvent>> {
  const reader = await postSSE(
    OPENCODE_ANTHROPIC_URL,
    {
      model: request.model,
      max_tokens: 4096,
      stream: true,
      system: request.system,
      messages: (request.messages as Msg[]).map((m) => ({ role: m.role, content: m.content })),
    },
    key,
    ctx.signal
  ).catch((e) => {
    ctx.cancel();
    throw e;
  });
  return pumpSSE(reader, extractAnthropicDelta, ctx.signal);
}

async function startGemini(
  request: ModelRequest,
  key: string,
  ctx: { signal: AbortSignal; cancel: () => void }
): Promise<AsyncGenerator<ModelEvent>> {
  const contents = (request.messages as Msg[]).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const reader = await postSSE(
    OPENCODE_GEMINI_URL(request.model, true),
    {
      system_instruction: request.system ? { parts: [{ text: request.system }] } : undefined,
      contents,
    },
    key,
    ctx.signal
  ).catch((e) => {
    ctx.cancel();
    throw e;
  });
  return pumpSSE(reader, extractGeminiDelta, ctx.signal);
}

export const opencodeAdapter: ProviderAdapter = {
  id: "opencode",
  label: "⬡ OpenCode",
  defaultBaseURL: "https://opencode.ai/inference/openai/v1",
  capabilities(model): CapabilityDescriptor {
    return opencodeCapabilities(model.model);
  },
  supportsToolCalling(model): boolean {
    return familyForModelId(model.model) === "openai-chat";
  },
  async complete(request: ModelRequest): Promise<AsyncIterable<ModelEvent>> {
    const model = (request.model || "").trim();
    if (!model) throw new ProviderError("Pick an OpenCode model first (Settings → AI endpoint).");
    const family: OpenCodeApiFamily = familyForModelId(model);
    if (family === "unsupported") {
      throw new ProviderError(
        `“${model}” has no documented streaming API Maxxen can speak — pick a Free chat model instead.`
      );
    }
    const key = (request.apiKey || "").trim();
    // Fail closed: a paid model without the user's key never leaves the server.
    if (modelNeedsKey(model) && !key) {
      throw new ProviderError(
        "OpenCode requires authentication for this model. Add your OpenCode key in Settings → AI endpoint (free models — names ending in -free — need no key)."
      );
    }
    const ctx = withTimeout(request.signal);
    try {
      switch (family) {
        case "openai-chat":
          return await startChat(request, key, ctx);
        case "openai-responses":
          return await startResponses(request, key, ctx);
        case "anthropic":
          return await startAnthropic(request, key, ctx);
        case "gemini":
          return await startGemini(request, key, ctx);
      }
    } catch (e) {
      ctx.cancel();
      throw e;
    }
  },
};
