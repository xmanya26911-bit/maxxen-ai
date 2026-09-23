import { NextResponse } from "next/server";
import { Octokit } from "octokit";

export async function POST(req: Request) {
  try {
    const { githubToken, path, content, message } = await req.json();
    if (!githubToken || !path) return NextResponse.json({ error: "githubToken + path required" }, { status: 400 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    try {
      await oct.rest.repos.get({ owner: me.login, repo });
    } catch {
      await oct.rest.repos.createForAuthenticatedUser({ name: repo, private: true, description: "Maxxen AI user storage" });
    }
    const body = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    let sha: string | undefined;
    try {
      const cur = await oct.rest.repos.getContent({ owner: me.login, repo, path });
      if (!Array.isArray(cur.data) && cur.data.type === "file") sha = cur.data.sha;
    } catch {}
    await oct.rest.repos.createOrUpdateFileContents({
      owner: me.login, repo, path,
      message: message || `maxxen: save ${path}`,
      content: Buffer.from(body).toString("base64"),
      sha,
    });
    return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, path });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "GitHub save failed" }, { status: 500 });
  }
}
