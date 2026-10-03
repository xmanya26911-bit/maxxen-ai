import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { GitHubMemoryStore, octokitMemoryIO } from "@/lib/user-memory/store";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";
import { resolveGithubToken } from "@/lib/github-account";
import { resolveGithubToken } from "@/lib/github-account";

/**
 * POST /api/user-memory/list — all user memories from the caller's own
 * `maxxen-data` repo (`memory/user/*.json`, fixed paths only).
 * Body: { githubToken }
 * Missing/corrupt files read as empty (never an error, never data loss).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { githubToken?: unknown } = {};
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
  try {
    const oct = new Octokit({ auth: resolvedToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const store = new GitHubMemoryStore(octokitMemoryIO(oct, me.login, "maxxen-data"));
    const memories = await store.getAll();
    return NextResponse.json({ ok: true, count: memories.length, memories });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Memory list failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — that token is invalid or expired." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
