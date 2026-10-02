import { NextResponse } from "next/server";
import { getLinkedGithubToken, linkGithubToken, unlinkGithubToken } from "@/lib/account-vault";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const email = sessionEmail(req);
    if (!email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const token = await getLinkedGithubToken(email);
    if (!token) return NextResponse.json({ ok: true, connected: false });
    return NextResponse.json({ ok: true, connected: true, method: "vercel_blob" });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "GitHub connection lookup failed." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const email = sessionEmail(req);
    if (!email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.githubToken === "string" ? body.githubToken : "";
    if (!token.trim()) return NextResponse.json({ error: "GitHub token is required." }, { status: 400 });
    await linkGithubToken(email, token);
    return NextResponse.json({ ok: true, connected: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "GitHub connection failed." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const email = sessionEmail(req);
    if (!email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    await unlinkGithubToken(email);
    return NextResponse.json({ ok: true, connected: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "GitHub disconnect failed." }, { status: 500 });
  }
}
