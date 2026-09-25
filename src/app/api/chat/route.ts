import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";

/**
 * MAXXEN Chat — BYOK streaming endpoint (replaces the vendor-key stub).
 *
 * POST /api/chat
 * Body: { messages, mode?, apiKey, baseURL?, model?, provider? }
 * Response: 200 text/plain — raw text chunks (deltas), no framing.
 * Errors: non-200 JSON { error }.
 *
 * Keys are per-request BYOK (never stored server-side). Modes mirror the
 * workspace MODES map; the selected mode changes the system instruction.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES: Record<string, string> = {
  chat: "Chat freely and helpfully. Be concise.",
  build:
    "Build a complete, SINGLE-FILE HTML page. Output exactly one ```html block containing the entire page (inline CSS+JS, no external build step). Before it, give a 2-line plan. After it, 2 lines on how to open/deploy it. Do not output multiple files.",
  code: "Answer with code first. Output fenced code blocks, each labeled with language and path like ```tsx:components/Button.tsx. Keep prose minimal — short plan, then code, then how to run.",
  design:
    "Act as a product designer + frontend engineer. Prioritize typography, spacing, hierarchy and restraint. Output a single ```html block with the design implemented, plus 3 bullet notes on the design decisions.",
  research:
    "Research carefully and show your work: key findings as bullets, trade-offs, and a recommendation. Cite what you checked. Never invent sources, versions or APIs — say when unsure.",
  deploy:
    "Guide shipping: explain the exact deploy steps for the user's own Vercel project (import repo, env vars, deploy), plus a pre-deploy checklist (build passes, env set, domains). If they paste an error, diagnose it precisely.",
  agent:
    "Work like an engineering collaborator: break the task into numbered file operations (inspect/create/update), narrate each step as you go, and finish with a summary of what changed and what to verify. You cannot run commands yourself — be explicit about that and give exact commands for the user.",
};

const BASE_SYSTEM =
  "You are MAXXEN, a multipurpose agentic AI that designs, builds and deploys websites, apps and dashboards with the user.";

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

  const modeKey =
    typeof mode === "string" && MODES[mode.toLowerCase()] ? mode.toLowerCase() : "chat";
  const system = `${BASE_SYSTEM}\n\nMode: ${modeKey.toUpperCase()}\n${MODES[modeKey]}`;
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
