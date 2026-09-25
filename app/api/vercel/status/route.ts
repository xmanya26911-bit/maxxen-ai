import { NextResponse } from "next/server";
export async function POST(req: Request) {
  try {
    const { vercelToken, deploymentId } = await req.json();
    if (!vercelToken) return NextResponse.json({ error: "vercelToken required — YOUR token." }, { status: 400 });
    if (!deploymentId || typeof deploymentId !== "string") return NextResponse.json({ error: "deploymentId required." }, { status: 400 });
    const r = await fetch("https://api.vercel.com/v13/deployments/" + encodeURIComponent(deploymentId), { headers: { authorization: "Bearer " + vercelToken } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const rawErr = (j as any)?.error?.message ?? (j as any)?.error ?? j;
      const detail = typeof rawErr === "string" ? rawErr : JSON.stringify(rawErr).slice(0, 300);
      return NextResponse.json({ error: "Vercel says HTTP " + r.status + ": " + detail }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: (j as any).id, state: (j as any).readyState || (j as any).status, url: (j as any).url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Status check failed" }, { status: 500 });
  }
}