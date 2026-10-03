import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { GitHubMemoryStore, octokitMemoryIO } from "@/lib/user-memory/store";
import { isMemoryCategory, sanitizeMemory, type UserMemory } from "@/lib/user-memory/types";
import { scanForSecrets } from "@/lib/secret-scan";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";
import { resolveGithubToken } from "@/lib/github-account";

/**
 * POST /api/user-memory/save — UI ops (edit/delete/create) on user memories.
 * Body: { githubToken, ops: [{ action: "update"|"delete"|"create", id?, patch?, memory? }] }
 *
 * - update: { id, patch } — content/category/importance/confidence/expiresAt.
 * - delete: { id }.
 * - create: { memory } — runs the normal merge plan (dedupes, never duplicates).
 * Secrets in any written content are refused (422). At most 50 ops per call.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Op =
  | { action: "update"; id: string; patch: Partial<UserMemory> }
  | { action: "delete"; id: string }
  | { action: "create"; memory: unknown };

export async function POST(req: Request) {
  let body: { githubToken?: unknown; ops?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (SESSION_ENFORCED && !hasValidSession(req, body)) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }
  const resolvedToken = await resolveGithubToken(req, body.githubToken);
  if (!resolvedToken) return NextResponse.json({ error: "Connect GitHub to this MAXXEN account first." }, { status: 401 });
  const { ops } = body;
  if (!Array.isArray(ops) || !ops.length || ops.length > 50) {
    return NextResponse.json({ error: "ops must be 1–50 operations." }, { status: 400 });
  }
  try {
    const oct = new Octokit({ auth: resolvedToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const store = new GitHubMemoryStore(octokitMemoryIO(oct, me.login, "maxxen-data"));
    const results: { action: string; id?: string; ok: boolean }[] = [];
    for (const raw of ops as Op[]) {
      if (!raw || typeof raw !== "object") continue;
      if (raw.action === "delete" && typeof raw.id === "string") {
        results.push({ action: "delete", id: raw.id, ok: await store.delete(raw.id) });
      } else if (raw.action === "update" && typeof raw.id === "string" && raw.patch && typeof raw.patch === "object") {
        const patch = raw.patch as Partial<UserMemory>;
        if (typeof patch.content === "string" && scanForSecrets(patch.content).length > 0) {
          return NextResponse.json({ error: "Refused: that edit contains credential-like material." }, { status: 422 });
        }
        if (patch.category !== undefined && !isMemoryCategory(patch.category)) {
          return NextResponse.json({ error: "Invalid category." }, { status: 400 });
        }
        const updated = await store.update(raw.id, patch);
        results.push({ action: "update", id: raw.id, ok: updated !== null });
      } else if (raw.action === "create") {
        const clean = sanitizeMemory((raw as { memory?: unknown }).memory);
        if (!clean) {
          results.push({ action: "create", ok: false });
          continue;
        }
        if (scanForSecrets(clean.content).length > 0) {
          return NextResponse.json({ error: "Refused: that memory contains credential-like material." }, { status: 422 });
        }
        const r = await store.applyCandidates([
          { content: clean.content, category: clean.category, importance: clean.importance, confidence: clean.confidence },
        ]);
        results.push({ action: "create", ok: r.created + r.updated > 0 });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Memory save failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — that token is invalid or expired." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
