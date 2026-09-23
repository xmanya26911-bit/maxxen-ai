import { NextResponse } from "next/server";
import { Octokit } from "octokit";

// Writes to the calling USER's own maxxen-data repo (derived from THEIR token).
// Body: { githubToken, path, content (object|string), message }
// Guards:
// - path allowlist: builds/, chats/, settings.json only; rejects traversal.
// - 404 on lookup = create; any other lookup failure surfaces.
// - SHA conflicts retried 3x with a fresh SHA.
// - repo auto-create tolerates an already-exists race.
const ALLOWED = [/^builds\//, /^chats\//, /^settings\.json$/];

function cleanPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw) throw new Error("path is required (builds/…, chats/… or settings.json).");
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (p.includes("..") || p.includes("//") || p.endsWith("/")) throw new Error("Invalid path.");
  if (!ALLOWED.some((re) => re.test(p))) throw new Error("Writes are limited to builds/, chats/ and settings.json.");
  if (p.length > 200) throw new Error("Path too long.");
  return p;
}

export async function POST(req: Request) {
  try {
    const { githubToken, path, content, message } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "githubToken required (YOUR token)." }, { status: 400 });
    let safePath: string;
    try {
      safePath = cleanPath(path);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const body = typeof content === "string" ? content : JSON.stringify(content ?? {}, null, 2);
    if (body.length > 1000000) return NextResponse.json({ error: "Content too large (1MB max)." }, { status: 413 });

    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    try {
      await oct.rest.repos.get({ owner: me.login, repo });
    } catch (e: any) {
      if (e?.status === 404) {
        try {
          await oct.rest.repos.createForAuthenticatedUser({ name: repo, private: true, description: "Maxxen AI user storage" });
        } catch (c: any) {
          if (c?.status !== 422) throw c;
        }
      } else throw e;
    }

    const encoded = () => Buffer.from(body).toString("base64");
    for (let attempt = 0; attempt < 3; attempt++) {
      let sha: string | undefined;
      try {
        const cur = await oct.rest.repos.getContent({ owner: me.login, repo, path: safePath });
        if (!Array.isArray(cur.data) && cur.data.type === "file") sha = cur.data.sha;
      } catch (e: any) {
        if (e?.status === 404) sha = undefined;
        else throw new Error(`Couldn't read existing file: ${e?.message || e}`);
      }
      try {
        await oct.rest.repos.createOrUpdateFileContents({
          owner: me.login,
          repo,
          path: safePath,
          message: typeof message === "string" && message ? message.slice(0, 140) : `maxxen: save ${safePath}`,
          content: encoded(),
          sha,
        });
        return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, path: safePath });
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (/sha|conflict|422/i.test(msg) && attempt < 2) continue;
        throw e;
      }
    }
    return NextResponse.json({ error: "Save conflicted repeatedly. Try again." }, { status: 409 });
  } catch (e: any) {
    const raw = e.message ?? "GitHub save failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — token invalid; recreate it (repo scope)." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
