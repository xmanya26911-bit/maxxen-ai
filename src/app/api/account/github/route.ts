import { NextResponse } from "next/server";
import { clearGithubTokenCookie, getGithubTokenCookie, setGithubTokenCookie } from "@/lib/github-token-cookie";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!sessionEmail(req)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const token = getGithubTokenCookie(req);
    return NextResponse.json({ ok: true, connected: Boolean(token), method: token ? "encrypted_cookie" : undefined });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "GitHub connection lookup failed." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!sessionEmail(req)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.githubToken === "string" ? body.githubToken.trim() : "";
    if (!token) return NextResponse.json({ error: "GitHub token is required." }, { status: 400 });
    const res = NextResponse.json({ ok: true, connected: true });
    setGithubTokenCookie(res, token);
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "GitHub connection failed." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!sessionEmail(req)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const res = NextResponse.json({ ok: true, connected: false });
    clearGithubTokenCookie(res);
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "GitHub disconnect failed." }, { status: 500 });
  }
}
