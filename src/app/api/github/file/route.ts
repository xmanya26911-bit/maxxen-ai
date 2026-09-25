import { NextResponse } from "next/server";

// Read a file at a specific commit + one-click rollback in the USER's repo.
// Body: { githubToken, path, sha?, rollback? }
// - sha omitted → current version (for preview-before-rollback).
// - rollback:true → writes that version back as a NEW commit (history kept,
//   nothing force-pushed, rollback itself is revertible).
export async function POST(req: Request) {
  try {
    const { Octokit } = await import("octokit");
    const { cleanGithubPath } = await import("@/lib/github-guard");
    const { githubToken, path, sha, rollback } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first." }, { status: 400 });
    const safePath = cleanGithubPath(path);
    if (!safePath) return NextResponse.json({ error: "path must be under builds/, chats/, or settings.json (no .., no .github)." }, { status: 400 });
    if (sha !== undefined && (typeof sha !== "string" || !sha.trim() || sha.length > 100))
      return NextResponse.json({ error: "Invalid sha." }, { status: 400 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";

    const getAt = async (ref?: string) => {
      const cur: any = await oct.rest.repos.getContent({ owner: me.login, repo, path: safePath, ref });
      if (Array.isArray(cur.data) || cur.data.type !== "file") throw new Error("Not a file.");
      const raw = Buffer.from(cur.data.content || "", "base64").toString("utf8");
      if (raw.length > 500000) throw new Error("File too large to rollback (500KB cap).");
      return { sha: cur.data.sha, text: raw };
    };

    const old = await getAt(typeof sha === "string" && sha.trim() ? sha.trim() : undefined);
    if (!rollback) return NextResponse.json({ ok: true, path: safePath, sha: old.sha, text: old.text.slice(0, 200000) });

    if (typeof sha !== "string" || !sha.trim())
      return NextResponse.json({ error: "sha required for rollback." }, { status: 400 });

    let curSha: string | undefined;
    try {
      const cur: any = await oct.rest.repos.getContent({ owner: me.login, repo, path: safePath });
      if (!Array.isArray(cur.data) && cur.data.type === "file") curSha = cur.data.sha;
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }
    await oct.rest.repos.createOrUpdateFileContents({
      owner: me.login,
      repo,
      path: safePath,
      message: `maxxen: rollback ${safePath} to ${sha.trim().slice(0, 7)}`,
      content: Buffer.from(old.text).toString("base64"),
      sha: curSha,
    });
    return NextResponse.json({ ok: true, path: safePath, restoredFrom: sha.trim().slice(0, 7) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Rollback failed" }, { status: 500 });
  }
}
