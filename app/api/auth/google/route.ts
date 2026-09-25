import { NextResponse } from "next/server";
import { signSession } from "@/lib/session";
export async function POST(req: Request) {
  try {
    const { credential } = await req.json();
    if (!credential || typeof credential !== "string") return NextResponse.json({ error: "Missing Google credential." }, { status: 400 });
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) return NextResponse.json({ error: "Google login isn't configured on this deployment yet." }, { status: 500 });
    const v = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    const info: any = await v.json().catch(() => ({}));
    if (!v.ok || !info?.email) return NextResponse.json({ error: "Google rejected this sign-in. Try again." }, { status: 401 });
    if (info.aud !== clientId) return NextResponse.json({ error: "Sign-in audience mismatch. Contact support." }, { status: 401 });
    if (info.email_verified !== "true") return NextResponse.json({ error: "That Google account isn't verified." }, { status: 401 });
    const email = String(info.email).toLowerCase();
    return NextResponse.json({ ok: true, email, session: signSession(email) });
  } catch {
    return NextResponse.json({ error: "Google sign-in failed. Try again." }, { status: 500 });
  }
}