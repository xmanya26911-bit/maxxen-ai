import { NextResponse } from "next/server";

// File history in the USER's own maxxen-data repo (rollback fuel).
// Body: { githubToken, path, limit? } → recent commits touching that path.
export async function POST(req: Request) {
  try {
    const { Octokit } = await import("octokit");
    const { cleanGithubPath } = await import("@/lib/github-guard");
    const { githubToken, path, limit } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first." }, { status: 400 });
    const safePath = cleanGithubPath(path);
    if (!safePath) return NextResponse.json({ error: "path must be under builds/, chats/, or settings.json." }, { status: 400 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const commits = await oct.rest.repos.listCommits({
      owner: me.login,
      repo: "maxxen-data",
      path: safePath,
      per_page: Math.min(Math.max(Number(limit) || 10, 1), 30),
    });
    return NextResponse.json({
      ok: true,
      history: commits.data.map((c: any) => ({
        sha: c.sha,
        message: c.commit?.message?.split("\n")[0] || "",
        date: c.commit?.author?.date || null,
        author: c.commit?.author?.name || "",
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "History failed" }, { status: 500 });
  }
}
