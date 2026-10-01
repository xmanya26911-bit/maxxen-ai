import { anthropicCapabilities } from "../capabilities";
import {
  ProviderError,
  type CapabilityDescriptor,
  type ModelEvent,
  type ModelRequest,
  type ProviderAdapter,
} from "../types";
import { providerHintFor } from "./openai";

/**
 * Claude adapter — the Anthropic Messages API.
 *
 * Preserves the exact behaviour the chat route used before: raw SSE fetch to
 * `/v1/messages`, the same headers (including the browser-access flag), the
 * same model default mapping, and the same delta extraction.
 *
 * It intentionally does NOT implement tool-calling: the agent loop requires
 * OpenAI-style function-calling, so `capabilities().toolCalling` is false and
 * the agent route refuses Claude rather than pretending it works. Making Claude
 * an agent-capable model is a provider-phase task.
 */
export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "✶ Claude",
  defaultBaseURL: "https://api.anthropic.com",

  capabilities(): CapabilityDescriptor {
    return anthropicCapabilities();
  },

  supportsToolCalling(): boolean {
    return false;
  },

  async complete(request: ModelRequest): Promise<AsyncIterable<ModelEvent>> {
    const url = `${request.baseURL.replace(/\/$/, "")}/v1/messages`;
    const model = request.model === "gpt-4o-mini" ? "claude-3-5-haiku-latest" : request.model;

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": request.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          stream: true,
          system: request.system,
          messages: request.messages,
        }),
        signal: request.signal,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Upstream unreachable";
      throw new ProviderError(raw + providerHintFor(e));
    }

    if (!upstream.ok || !upstream.body) {
      const j = (await upstream.json().catch(() => ({}))) as {
        error?: { message?: string };
        status?: number;
      };
      const msg = `${upstream.status} ${j?.error?.message || "Anthropic request failed"}`;
      throw new ProviderError(msg + providerHintFor(msg, upstream.status), upstream.status);
    }

    const reader = upstream.body.getReader();

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ModelEvent> {
        const decoder = new TextDecoder();
        let buf = "";
        let empty = true;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              const line = part.split("\n").find((l) => l.startsWith("data:"));
              if (!line) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const ev = JSON.parse(payload) as { delta?: { text?: string } };
                const text = ev?.delta?.text;
                if (typeof text === "string" && text) {
                  empty = false;
                  yield { type: "delta", text };
                }
              } catch {
                /* partial chunk — wait for more */
              }
            }
          }
          if (empty) {
            yield { type: "delta", text: "MAXXEN returned an empty response. Retry, or switch models." };
          }
        } catch (e) {
          if (request.signal?.aborted || (e as Error)?.name === "AbortError") return;
          yield { type: "delta", text: "\n\nConnection to the model dropped mid-answer." };
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* noop */
          }
        }
        yield { type: "done" };
      },
    };
  },
};
