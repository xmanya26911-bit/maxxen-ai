import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";
import { modeBlock, normalizeMode } from "@/lib/modes";

/**
 * MAXXEN Chat — BYOK streaming endpoint.
 *
 * POST /api/chat
 * Body: { messages, mode?, apiKey, baseURL?, model?, provider? }
 * Response: 200 text/plain — raw text chunks (deltas), no framing.
 * Errors: non-200 JSON { error }.
 *
 * Mode instructions come from src/lib/modes.ts so the chips the user sees and
 * the prompt the server builds can never drift apart again.
 *
 * Keys are per-request BYOK (never stored server-side, but they DO transit this
 * server on their way to the provider — see Settings for the honest model).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared Maxxen identity — one stable agent across every model provider.
import { MAXXEN_IDENTITY } from "@/lib/maxxen-runtime";
const BASE_SYSTEM = MAXXEN_IDENTITY;

function hintFor(e: unknown, status?: number): string {
  const raw = String((e as Error)?.message ?? e ?? "");
  if (
    status === 401 ||
    status === 403 ||
    /invalid api key|incorrect api key|unauthorized|invalid_api_key|authentication_error/i.test(raw)
  )
    return " — API key rejected. Re-paste the key for that provider in Settings.";
  if (status === 404 || /model_not_found|does not exist|invalid model|not_found/i.test(raw))
    return " — model ID unknown to that provider. Check the exact ID in Settings.";
  if (status === 429 || /rate.?limit|quota|overloaded/i.test(raw))
    return " — provider rate limit. Wait a bit or switch models.";
  if (/fetch failed|ENOTFOUND|ECONN|network|timeout/i.test(raw)) return " — can't reach that Base URL. Check it in Settings.";
  return "";
}

export async function POST(req: Request) {
  let body: {
    messages?: unknown;
    mode?: unknown;
    apiKey?: unknown;
    baseURL?: unknown;
    model?: unknown;
    provider?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, mode, apiKey, baseURL, model, provider } = body;
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json(
      { error: "Missing API key. Add your provider key in Settings → Endpoint, then retry." },
      { status: 400 }
    );
  }
  const clean = sanitizeMessages(messages).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 8000),
  }));
  if (!clean.length) return NextResponse.json({ error: "No messages to send." }, { status: 400 });

  const modeKey = normalizeMode(mode);
  const system = `${BASE_SYSTEM}\n\n${modeBlock(modeKey)}`;
  const sized = budgeted(clean);

  let url: string;
  try {
    url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad base URL." }, { status: 400 });
  }
  const mid = (typeof model === "string" ? model : "").trim() || "gpt-4o-mini";
  const useAnthropic = provider === "anthropic" || /api\.anthropic\.com/i.test(url);

  const encoder = new TextEncoder();

  // Anthropic branch — re-emit Anthropic deltas as raw text.
  if (useAnthropic) {
    let upstream: Response;
    try {
      upstream = await fetch(`${url.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: mid === "gpt-4o-mini" ? "claude-3-5-haiku-latest" : mid,
          max_tokens: 4096,
          stream: true,
          system,
          messages: sized,
        }),
        signal: req.signal,
      });
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Upstream unreachable";
      return NextResponse.json({ error: raw + hintFor(e) }, { status: 502 });
    }
    if (!upstream.ok || !upstream.body) {
      const j = await upstream.json().catch(() => ({} as Record<string, unknown>));
      const err = j as { error?: { message?: string }; status?: number };
      const msg = `${upstream.status} ${err?.error?.message || "Anthropic request failed"}`;
      return NextResponse.json({ error: msg + hintFor(msg, upstream.status) }, { status: 502 });
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let empty = true;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
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
                const delta = ev?.delta?.text;
                if (typeof delta === "string" && delta) {
                  empty = false;
                  controller.enqueue(encoder.encode(delta));
                }
              } catch {
                /* partial chunk — wait for more */
              }
            }
          }
          if (empty) {
            controller.enqueue(encoder.encode("MAXXEN returned an empty response. Retry, or switch models."));
          }
        } catch (e: unknown) {
          if (!(req.signal.aborted || (e as Error)?.name === "AbortError")) {
            try {
              controller.enqueue(encoder.encode("\n\nConnection to the model dropped mid-answer."));
            } catch {
              /* closed */
            }
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* noop */
          }
          controller.close();
        }
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // OpenAI-compatible branch.
  let gen: AsyncIterable<{ choices: { delta?: { content?: string } }[] }>;
  try {
    const client = new OpenAI({ apiKey, baseURL: url });
    gen = (await client.chat.completions.create({
      model: mid,
      messages: [{ role: "system", content: system }, ...sized],
      temperature: 0.7,
      stream: true,
    })) as unknown as AsyncIterable<{ choices: { delta?: { content?: string } }[] }>;
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Completion failed";
    const status = (e as { status?: number })?.status;
    return NextResponse.json({ error: raw + hintFor(e, status) }, { status: 502 });
  }

  let sawAny = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          if (req.signal.aborted) break;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            sawAny = true;
            controller.enqueue(encoder.encode(delta));
          }
        }
        if (!sawAny) {
          controller.enqueue(encoder.encode("MAXXEN returned an empty response. Retry, or switch models."));
        }
      } catch (e: unknown) {
        if (!(req.signal.aborted || (e as Error)?.name === "AbortError")) {
          try {
            controller.enqueue(encoder.encode("\n\nConnection to the model dropped mid-answer."));
          } catch {
            /* closed */
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
