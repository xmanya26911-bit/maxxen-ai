import { NextResponse } from "next/server";
import { Octokit } from "octokit";

// Lists the calling USER's own maxxen-data repo contents (their storage).
// Body: { githubToken, path? } — path defaults to "" (repo root).
// Never touches any other account: everything derives from the user's token.
export async function POST(req: Request) {
  try {
    const { githubToken, path } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token on /settings → Storage first." }, { status: 400 });
    const { cleanGithubPath } = await import("@/lib/github-guard");
    const safePath = cleanGithubPath(path ?? "", { allowRoot: true });
    if (safePath === null)
      return NextResponse.json({ error: "path must be root, builds/, chats/, or settings.json." }, { status: 400 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    try {
      await oct.rest.repos.get({ owner: me.login, repo });
    } catch (e: any) {
      if (e?.status === 404)
        return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, path: safePath, entries: [], empty: true });
      throw e;
    }
    const cur = await oct.rest.repos.getContent({ owner: me.login, repo, path: safePath });
    if (!Array.isArray(cur.data)) {
      // Single file: include decoded text (truncated) so the UI can preview it.
      let text: string | null = null;
      const d: any = cur.data;
      if (d.type === "file" && d.encoding === "base64" && typeof d.content === "string" && (d.size ?? 0) < 200000) {
        try {
          text = Buffer.from(d.content, "base64").toString("utf-8");
        } catch {
          text = null;
        }
      }
      return NextResponse.json({
        ok: true,
        repo: `${me.login}/${repo}`,
        path: safePath,
        file: { name: d.name, path: d.path, type: d.type, size: d.size ?? 0, text },
      });
    }
    const items = cur.data.map((e: any) => ({
      name: e.name,
      path: e.path,
      type: e.type,
      size: e.size ?? 0,
    }));
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, path: safePath, entries: items });
  } catch (e: any) {
    const raw = e.message ?? "GitHub list failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — that token is invalid or expired; create a new one (repo scope)." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
