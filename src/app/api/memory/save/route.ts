import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { sanitizeMemory } from "@/lib/memory";

/**
 * Save a project's memory to the USER's own maxxen-data repo.
 * Body: { githubToken, project, memory } — memory is validated + bounded.
 */
export async function POST(req: Request) {
  try {
    const { githubToken, project, memory } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first." }, { status: 400 });
    const pid = typeof project === "string" ? project.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    if (!pid) return NextResponse.json({ error: "project required." }, { status: 400 });
    const clean = sanitizeMemory(memory);
    const body = JSON.stringify({ ...clean, updatedAt: new Date().toISOString() }, null, 2);
    if (body.length > 20000) return NextResponse.json({ error: "Memory too large (20KB max)." }, { status: 413 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const path = `memory/${pid}.json`;
    let sha: string | undefined;
    try {
      const cur: unknown = await oct.rest.repos.getContent({ owner: me.login, repo: "maxxen-data", path });
      const data = cur as { data: unknown };
      if (!Array.isArray(data.data) && (data.data as { type?: string }).type === "file") {
        sha = (data.data as { sha?: string }).sha;
      }
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status !== 404) throw e;
    }
    await oct.rest.repos.createOrUpdateFileContents({
      owner: me.login,
      repo: "maxxen-data",
      path,
      message: `maxxen: save project memory ${pid}`,
      content: Buffer.from(body).toString("base64"),
      sha,
    });
    return NextResponse.json({ ok: true, path });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err?.message ?? "Memory save failed" }, { status: 500 });
  }
}
