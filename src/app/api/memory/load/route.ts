import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { sanitizeMemory, EMPTY_MEMORY } from "@/lib/memory";

/**
 * Load a project's memory from the USER's own maxxen-data repo.
 * Body: { githubToken, project } — project is the conversation id.
 * Missing file = empty memory (not an error).
 */
export async function POST(req: Request) {
  try {
    const { githubToken, project } = await req.json();
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first." }, { status: 400 });
    const pid = typeof project === "string" ? project.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    if (!pid) return NextResponse.json({ error: "project required." }, { status: 400 });
    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    try {
      const cur: unknown = await oct.rest.repos.getContent({
        owner: me.login,
        repo: "maxxen-data",
        path: `memory/${pid}.json`,
      });
      const data = cur as { data: unknown };
      if (!Array.isArray(data.data) && (data.data as { type?: string }).type === "file") {
        const raw = Buffer.from(((data.data as { content?: string }).content || ""), "base64").toString("utf8");
        return NextResponse.json({ ok: true, memory: sanitizeMemory(JSON.parse(raw)) });
      }
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status !== 404) throw e;
    }
    return NextResponse.json({ ok: true, memory: { ...EMPTY_MEMORY } });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err?.message ?? "Memory load failed" }, { status: 500 });
  }
}
