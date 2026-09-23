import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { vercelToken, projectName, target } = await req.json();
    if (!vercelToken || !projectName)
      return NextResponse.json({ error: "vercelToken + projectName required (Settings > Hosting)" }, { status: 400 });
    const r = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!r.ok) return NextResponse.json({ error: "Project not found on your Vercel account. Create maxxen project first." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      message: `Ready to deploy to ${projectName}. Push this Maxxen AI folder to GitHub and import in Vercel, or wire /api/vercel/deploy to create deployments from generated code.`,
      target: target || "production",
      dashboard: `https://vercel.com/dashboard`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Vercel failed" }, { status: 500 });
  }
}
