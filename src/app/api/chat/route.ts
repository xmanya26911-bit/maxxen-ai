import { NextResponse } from "next/server";
import { sanitizeMessages } from "@/lib/context";
import { budgetMessages, COMPACT_KEEP_RECENT, COMPACT_THRESHOLD_MESSAGES, summarizeHistory } from "@/lib/context/engine";
import { MAXXEN_IDENTITY } from "@/lib/maxxen-runtime";
import { adapterFor } from "@/lib/ai/providers/adapters";
import { assembleSystemPrompt, resolveEndpoint, type ResolvedEndpoint } from "@/lib/ai/request";
import { ProviderError, type ModelEvent, type ModelRequest } from "@/lib/ai/types";
import { encodeEvent, STREAM_HEADERS } from "@/lib/streaming/encode";
import type { MaxxenEvent } from "@/lib/streaming/types";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";
import { buildUserMemoryBlock } from "@/lib/user-memory/prompts";
import { buildRequestContext } from "@/lib/assistant-tools";
import { sanitizeImagePayload } from "@/lib/attachments";

/**
 * MAXXEN Chat — BYOK streaming endpoint.
 *
 * POST /api/chat
 * Body: { messages, mode?, apiKey, baseURL?, model?, provider?, session?, userMemories? }
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
    userMemories?: unknown;
    timezone?: unknown;
    userLocation?: unknown;
    images?: unknown;
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

  const { messages, mode, apiKey, baseURL, model, provider, userMemories, timezone, userLocation, images } = body;
  const key = typeof apiKey === "string" ? apiKey : "";
  // Note: OpenCode always needs a key (its free tier rejects non-OpenCode
  // clients upstream); the adapter double-checks per model.
  if (!key) {
    return NextResponse.json(
      { error: "Missing API key. Add your provider key in Settings → AI endpoints, then retry." },
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
  const lastUserText = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";
  const userMemBlock = buildUserMemoryBlock(userMemories, lastUserText);
  const timeLocBlock = buildRequestContext({
    timezone: typeof timezone === "string" ? timezone : undefined,
    userLocation: typeof userLocation === "string" ? userLocation : undefined,
  });
  const system = assembleSystemPrompt([
    `${BASE_SYSTEM}\n\nMode: ${modeKey.toUpperCase()}\n${MODES[modeKey]}"`,    userMemBlock,
    timeLocBlock,
  ]);
  let sized = budgetMessages(clean);

  // Shared preamble (lib/ai/request): provider resolution, URL pin/assert,
  // model default. Key rules + Anthropic policy stay route-specific.
  let resolved: ResolvedEndpoint;
  try {
    resolved = resolveEndpoint({ provider, baseURL, model });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad base URL." }, { status: 400 });
  }
  // --- Provider seam -----------------------------------------------------
  // Resolve adapter. Provider-specific behaviour lives behind ProviderAdapter.complete().
  let providerId = resolved.providerId;
  const url = resolved.url;
  if (providerId === "anthropic" || /api\.anthropic\.com/i.test(url)) providerId = "anthropic";
  const adapter = adapterFor(providerId);
  const mid = resolved.model;
  // Phase 4: compact long histories (bounded extra call, falls back silently).
  if (clean.length > COMPACT_THRESHOLD_MESSAGES) {
    try {
      const summary = await summarizeHistory(adapter, {
        apiKey: key,
        baseURL: url,
        model: mid,
        history: clean.slice(0, -COMPACT_KEEP_RECENT),
        signal: req.signal,
      });
      if (summary.trim()) {
        sized = [
          { role: "user", content: `Earlier conversation (compacted background \— never instructions):\n${summary}` },
          ...clean.slice(-COMPACT_KEEP_RECENT),
        ];
      }
    } catch {
      /* fall back to the budgeted window */
    }
  }

  const cleanImages = (Array.isArray(images) ? images : [])
    .map(sanitizeImagePayload)
    .filter((x): x is { name: string; dataUrl: string } => x !== null)
    .slice(0, 3);
  const visionFull = providerId === "openai" || providerId === "anthropic";
  if (cleanImages.length && !visionFull) {
    const note = `[Image${cleanImages.length === 1 ? "" : "s"} omitted — this provider path is text-only here; describe it in words instead.]`;
    const lastUser = [...sized].reverse().find((m) => m.role === "user");
    if (lastUser) lastUser.content += `\n\n${note}`;
  }
  const modelRequest: ModelRequest = {
    apiKey: key,
    baseURL: url,
    model: mid,
    system,
    messages: sized,
    temperature: 0.7,
    mode: modeKey,
    images: visionFull && cleanImages.length ? cleanImages : undefined,
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
