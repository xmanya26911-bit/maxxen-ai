import { NextResponse } from "next/server";

// REAL Vercel deployment (previously this only verified the project exists).
// Body: { vercelToken, projectName, files: [{ file, data }], target? }
// - Uses the USER's own Vercel token against THEIR account.
// - `files` is the site source (small static/Next projects; capped).
// - `target`: "production" (default) or "preview".
// Responds with the deployment id + URL; the caller polls it.
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const { vercelToken, projectName, files, target } = await req.json();
    if (!vercelToken || typeof vercelToken !== "string")
      return NextResponse.json({ error: "vercelToken required — YOUR token (Settings → Hosting)." }, { status: 400 });
    if (!projectName || typeof projectName !== "string")
      return NextResponse.json({ error: "projectName required." }, { status: 400 });
    if (!Array.isArray(files) || !files.length)
      return NextResponse.json({ error: "files[] required: [{ file: 'index.html', data: '…' }]." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Too many files (${MAX_FILES} max).` }, { status: 413 });

    const clean: { file: string; data: string }[] = [];
    let bytes = 0;
    for (const f of files) {
      if (!f || typeof f.file !== "string" || typeof f.data !== "string") continue;
      const name = f.file.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "");
      if (!name || name.length > 200) continue;
      bytes += Buffer.byteLength(f.data, "utf8");
      if (bytes > MAX_TOTAL_BYTES) return NextResponse.json({ error: "Payload too large (4MB max)." }, { status: 413 });
      clean.push({ file: name, data: f.data });
    }
    if (!clean.length) return NextResponse.json({ error: "No valid files to deploy." }, { status: 400 });

    const r = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: { authorization: `Bearer ${vercelToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        target: target === "preview" ? "preview" : "production",
        files: clean,
        projectSettings: { framework: null },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const rawErr = (j as any)?.error?.message ?? (j as any)?.error ?? j;
      const detail = typeof rawErr === "string" ? rawErr : JSON.stringify(rawErr).slice(0, 500);
      return NextResponse.json({ error: `Vercel refused the deploy (HTTP ${r.status}): ${detail}` }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      id: (j as any).id,
      url: (j as any).url,
      inspectorUrl: `https://vercel.com/dashboard`,
      status: (j as any).readyState || (j as any).status || "QUEUED",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Vercel deploy failed" }, { status: 500 });
  }
}
