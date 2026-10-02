import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { isDeletableChatPath } from "@/lib/chat-sync";
import { resolveGithubToken } from "@/lib/github-account";

/**
 * Delete a synced chat file from the USER's own maxxen-data repo.
 * Body: { githubToken, path }
 *
 * Narrower than the generic guards by design: ONLY chats/<id>.json and
 * chats/_index.json. Owner derives from the token (self-only, like every
 * other GitHub route). Missing file = success (already gone).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { githubToken?: unknown; path?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { githubToken, path } = body;
  const resolvedToken = await resolveGithubToken(req, githubToken);
  if (!resolvedToken) {
    return NextResponse.json({ error: "Connect GitHub to this MAXXEN account first." }, { status: 401 });
  }
  if (!isDeletableChatPath(path)) {
    return NextResponse.json({ error: "Only synced chat files can be deleted here." }, { status: 400 });
  }
  const safePath = path as string;
  try {
    const oct = new Octokit({ auth: resolvedToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    let sha: string | undefined;
    try {
      const cur: unknown = await oct.rest.repos.getContent({ owner: me.login, repo, path: safePath });
      const d = (cur as { data: unknown }).data;
      if (!Array.isArray(d) && (d as { type?: string }).type === "file") {
        sha = (d as { sha: string }).sha;
      } else {
        return NextResponse.json({ error: "Not a file." }, { status: 400 });
      }
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 404) {
        return NextResponse.json({ ok: true, path: safePath, alreadyGone: true });
      }
      throw e;
    }
    await oct.rest.repos.deleteFile({
      owner: me.login,
      repo,
      path: safePath,
      message: `maxxen: delete ${safePath}`,
      sha: sha as string,
    });
    return NextResponse.json({ ok: true, path: safePath });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Delete failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — that token is invalid or expired." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
