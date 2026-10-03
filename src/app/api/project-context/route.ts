import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import {
  SUPPORTED_DIRS,
  buildProjectContext,
  candidateFiles,
  detectDirs,
  isSafePath,
  parseConfigFile,
  MAX_FILE_BYTES,
  type DirListing,
  type SupportedDir,\n  type ProjectContextFile,
} from "@/lib/project-context";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

/**
 * POST /api/project-context — agent project config for an opened repository.
 *
 * Body: { githubToken, owner, repo, path? }
 *
 * Lists `path` (default: repo root) in the CALLER's own repo — `owner` must
 * equal the token's login, the same self-only rule as the other GitHub
 * routes — detects `.opencode/` (plus .claude/.cursor/.windsurf/.roo),
 * safely reads allowlisted config files, and returns agent-ready context.
 *
 * Security: read-only; allowlisted text files only; credential filenames are
 * never fetched; per-file and total byte caps; traversal rejected. Detecting
 * `.opencode/` NEVER implies OpenCode authentication — see lib/project-context.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRS = new Set<string>(SUPPORTED_DIRS);

export async function POST(req: Request) {
  let body: { githubToken?: unknown; owner?: unknown; repo?: unknown; path?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (SESSION_ENFORCED && !hasValidSession(req, body)) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }
  const { githubToken, owner, repo, path } = body;
  if (typeof githubToken !== "string" || !githubToken.trim()) {
    return NextResponse.json({ error: "Add YOUR GitHub token on /settings → Storage first." }, { status: 400 });
  }
  if (typeof owner !== "string" || !/^[a-zA-Z0-9-]{1,39}$/.test(owner.trim())) {
    return NextResponse.json({ error: "owner must be a GitHub username." }, { status: 400 });
  }
  if (typeof repo !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(repo.trim())) {
    return NextResponse.json({ error: "repo must be a repository name." }, { status: 400 });
  }
  const rel = typeof path === "string" ? path.trim().replace(/^\/+|\/+$/g, "") : "";
  if (rel && !isSafePath(rel)) {
    return NextResponse.json({ error: "path must be a relative directory without traversal." }, { status: 400 });
  }
  try {
    const oct = new Octokit({ auth: githubToken.trim() });
    const { data: me } = await oct.rest.users.getAuthenticated();
    // Self-only: a token may only inspect its own owner's repositories.
    if (me.login.toLowerCase() !== owner.trim().toLowerCase()) {
      return NextResponse.json(
        { error: "That token belongs to a different account — you can only inspect your own repositories." },
        { status: 403 }
      );
    }
    const cur = await oct.rest.repos.getContent({ owner: me.login, repo: repo.trim(), path: rel });
    if (!Array.isArray(cur.data)) {
      return NextResponse.json({ error: "path must be a directory." }, { status: 400 });
    }
    const entries: DirListing[] = cur.data.map((e: { path?: string; type?: string; size?: number }) => ({
      path: String(e.path ?? ""),
      type: e.type === "file" ? "file" : "dir",
      size: typeof e.size === "number" ? e.size : 0,
    }));
    const detected = detectDirs(entries);
    if (!detected.length) {
      return NextResponse.json({ ok: true, repo: `${me.login}/${repo.trim()}`, detected: [], files: [], omitted: [], context: "" });
    }
    const omitted: string[] = [];
    const files: ProjectContextFile[] = [];
    for (const dir of detected) {
      for (const cand of candidateFiles(entries, dir as SupportedDir)) {
        if (!DIRS.has(cand.path.split("/")[0])) continue;
        try {
          const f = await oct.rest.repos.getContent({ owner: me.login, repo: repo.trim(), path: cand.path });
          const d = f.data as { type?: string; encoding?: string; content?: string; size?: number };
          if (d.type !== "file" || d.encoding !== "base64" || typeof d.content !== "string") {
            omitted.push(`${cand.path} (not a readable file)`);
            continue;
          }
          if ((d.size ?? 0) > MAX_FILE_BYTES) {
            omitted.push(`${cand.path} (over size cap)`);
            continue;
          }
          const text = Buffer.from(d.content, "base64").toString("utf-8");
          files.push(parseConfigFile(dir as SupportedDir, cand.path, text));
        } catch {
          omitted.push(`${cand.path} (unreadable)`);
        }
      }
    }
    const ctx = buildProjectContext(files, omitted);
    return NextResponse.json({
      ok: true,
      repo: `${me.login}/${repo.trim()}`,
      detected: ctx.detected,
      files: files.map((f) => ({ dir: f.dir, path: f.path, kind: f.kind, truncated: f.truncated })),
      omitted: ctx.omitted,
      context: ctx.markdown,
    });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Project context failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — that token is invalid or expired." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
