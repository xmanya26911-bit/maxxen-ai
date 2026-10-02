import { NextResponse } from "next/server";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";
import { MAXXEN_IDENTITY } from "@/lib/maxxen-runtime";
import { adapterFor } from "@/lib/ai/providers/adapters";
import { resolveProvider } from "@/lib/ai/providers/registry";
import { ProviderError, type ModelEvent, type ModelRequest } from "@/lib/ai/types";
import { encodeEvent, STREAM_HEADERS } from "@/lib/streaming/encode";
import type { MaxxenEvent } from "@/lib/streaming/types";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

/**
 * MAXXEN Chat — BYOK streaming endpoint.
 *
 * POST /api/chat
 * Body: { messages, mode?, apiKey, baseURL?, model?, provider?, session? }
 * Response: 200 text/event-stream — canonical MaxxenEvents (see lib/streaming).
 * Errors before streaming: non-200 JSON { error }.
 *
 * Provider-specific logic now lives behind the provider adapter (lib/ai): this
 * route only parses, resolves a provider, streams model events and encodes
 * canonical events. Keys are per-request BYOK (never stored server-side).
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

// Shared Maxxen identity — one stable agent across every model provider.
const BASE_SYSTEM = MAXXEN_IDENTITY;

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

  // Session seam (Phase 0) — observe-only; see lib/security/guard. Flip
  // SESSION_ENFORCED to true once the client sends a session token.
  if (SESSION_ENFORCED && !hasValidSession(req, body)) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }

  const { messages, mode, apiKey, baseURL, model, provider } = body;
  // OpenCode free models are explicitly keyless per OpenCode docs — the
  // adapter enforces paid-model auth, so the route permits an empty key here.
  const key = typeof apiKey === "string" ? apiKey : "";
  if (!key && provider !== "opencode") {
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
  // --- Provider seam -----------------------------------------------------
  // Resolve provider + adapter. This route no longer imports a provider SDK;
  // provider-specific behaviour lives behind ProviderAdapter.complete().
  let providerId = resolveProvider(provider, "custom");
  if (providerId === "anthropic" || /api\.anthropic\.com/i.test(url)) providerId = "anthropic";
  const adapter = adapterFor(providerId);
  const mid = (typeof model === "string" ? model : "").trim() || "gpt-4o-mini";

  const modelRequest: ModelRequest = {
    apiKey: key,
    baseURL: url,
    model: mid,
    system,
    messages: sized,
    temperature: 0.7,
    mode: modeKey,
    signal: req.signal,
  };

  // Establish the stream BEFORE responding, so immediate failures keep the
  // existing JSON error contract (502) rather than a half-open event stream.
  let events: AsyncIterable<ModelEvent>;
  try {
    events = await adapter.complete(modelRequest);
  } catch (e) {
    const pe = e as ProviderError;
    return NextResponse.json({ error: pe?.message || "Completion failed" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: MaxxenEvent) =>
    controller.enqueue(encoder.encode(encodeEvent(event)));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        send(controller, { type: "run.start", mode: modeKey, model: mid });
        for await (const ev of events) {
          if (req.signal.aborted) break;
          if (ev.type === "delta") send(controller, { type: "message.delta", text: ev.text });
          else if (ev.type === "error") send(controller, { type: "error", message: ev.message });
        }
        send(controller, { type: "run.complete", mode: modeKey });
      } catch (e: unknown) {
        if (!(req.signal.aborted || (e as Error)?.name === "AbortError")) {
          try {
            send(controller, { type: "error", message: e instanceof Error ? e.message : "Stream failed." });
          } catch {
            /* closed */
          }
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: STREAM_HEADERS });


}
