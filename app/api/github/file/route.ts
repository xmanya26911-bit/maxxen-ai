import { NextResponse } from "next/server";

// Read a file at a specific commit + one-click rollback in the USER's repo.
// Body: { githubToken, path, sha?, rollback? }
// - sha omitted → current version (for preview-before-rollback).
// - rollback:true → writes that version back as a NEW commit (history kept,
//   nothing force-pushed, rollback itself is revertible).
export async function POST(req: Request) {
  try {
    const { Octokit } = await import("octokit");
    const { githubToken, path, sha, rollback } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first." }, { status: 400 });
    if (!path || typeof path !== "string") return NextResponse.json({ error: "path required." }, { status: 400 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";

    const getAt = async (ref?: string) => {
      const cur: any = await oct.rest.repos.getContent({ owner: me.login, repo, path, ref });
      if (Array.isArray(cur.data) || cur.data.type !== "file") throw new Error("Not a file.");
      return { sha: cur.data.sha, text: Buffer.from(cur.data.content || "", "base64").toString("utf8") };
    };

    const old = await getAt(sha || undefined);
    if (!rollback) return NextResponse.json({ ok: true, path, sha: old.sha, text: old.text.slice(0, 200000) });

    let curSha: string | undefined;
    try {
      const cur: any = await oct.rest.repos.getContent({ owner: me.login, repo, path });
      if (!Array.isArray(cur.data) && cur.data.type === "file") curSha = cur.data.sha;
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }
    await oct.rest.repos.createOrUpdateFileContents({
      owner: me.login,
      repo,
      path,
      message: `maxxen: rollback ${path} to ${String(sha).slice(0, 7)}`,
      content: Buffer.from(old.text).toString("base64"),
      sha: curSha,
    });
    return NextResponse.json({ ok: true, path, restoredFrom: String(sha).slice(0, 7) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Rollback failed" }, { status: 500 });
  }
}
