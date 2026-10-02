import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { GitHubMemoryStore, octokitMemoryIO } from "@/lib/user-memory/store";
import { parseExtractionResult } from "@/lib/user-memory/extractor";
import { EXTRACTION_SYSTEM } from "@/lib/user-memory/prompts";
import { sanitizeMessages, type ChatMsg } from "@/lib/context";
import { adapterFor } from "@/lib/ai/providers/adapters";
import { resolveProvider } from "@/lib/ai/providers/registry";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

/**
 * POST /api/user-memory/extract — one LLM pass over a finished conversation,
 * then merge + ONE batched write per touched category file.
 *
 * Body: { githubToken, messages, apiKey, baseURL?, model?, provider?, auto? }
 * - auto === false → { ok: true, skipped: true } (master toggle lives client-side).
 * - The extraction call reuses the caller's own provider via the adapter seam
 *   (same key/model family rules as chat — opencode included).
 * - Failures NEVER propagate: { ok: false, error } with 200, so a failed
 *   memory write can never break the user's chat response. Clients call this
 *   fire-and-forget (no await).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 12;
const MAX_COLLECT_CHARS = 2000;

export async function POST(req: Request) {
  let body: {
    githubToken?: unknown;
    messages?: unknown;
    apiKey?: unknown;
    baseURL?: unknown;
    model?: unknown;
    provider?: unknown;
    auto?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (SESSION_ENFORCED && !hasValidSession(req, body)) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }
  const { githubToken, messages, apiKey, baseURL, model, provider, auto } = body;
  if (auto === false) return NextResponse.json({ ok: true, skipped: true });
  if (typeof githubToken !== "string" || !githubToken.trim()) {
    return NextResponse.json({ ok: false, error: "Missing GitHub token — memories kept locally only." });
  }
  const clean: ChatMsg[] = sanitizeMessages(messages)
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!clean.length) return NextResponse.json({ ok: true, skipped: true });
  const key = typeof apiKey === "string" ? apiKey : "";
  if (!key) return NextResponse.json({ ok: true, skipped: true }); // no key → no extraction call
  const mid = (typeof model === "string" ? model : "").trim() || "gpt-4o-mini";
  const url = typeof baseURL === "string" ? baseURL : "";
  try {
    let providerId = resolveProvider(provider, "custom");
    if (providerId === "anthropic" || /api\.anthropic\.com/i.test(url)) providerId = "anthropic";
    const adapter = adapterFor(providerId);
    const turns = clean.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
    const events = await adapter.complete({
      apiKey: key,
      baseURL: url,
      model: mid,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: `Conversation:\n${turns.slice(0, 12000)}` }],
      temperature: 0.2,
      signal: req.signal,
    });
    let text = "";
    for await (const ev of events) {
      if (req.signal.aborted) break;
      if (ev.type === "delta") {
        text += ev.text;
        if (text.length > MAX_COLLECT_CHARS) break;
      } else if (ev.type === "error") {
        return NextResponse.json({ ok: false, error: ev.message });
      }
    }
    const { shouldRemember, candidates } = parseExtractionResult(text);
    if (!shouldRemember || !candidates.length) return NextResponse.json({ ok: true, remembered: false });
    const oct = new Octokit({ auth: githubToken.trim() });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const store = new GitHubMemoryStore(octokitMemoryIO(oct, me.login, "maxxen-data"));
    const applied = await store.applyCandidates(candidates);
    return NextResponse.json({ ok: true, remembered: true, ...applied });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Extraction failed";
    return NextResponse.json({ ok: false, error: raw });
  }
}
