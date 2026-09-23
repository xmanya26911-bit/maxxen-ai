import { NextResponse } from "next/server";
import { signSession } from "@/lib/session";

// "Continue with Google" — real OAuth 2.0 via Google Identity Services.
// The browser gives us an ID token; we verify it server-side with Google
// (audience must be OUR OAuth client). No passwords, no OTP needed.
// What this proves: the user owns this Gmail address. Model access still
// needs one API key (OpenAI/Anthropic/Google issue keys, not OAuth grants —
// no third party can "log you into" API usage; anyone claiming so is faking
// it or violating provider ToS).
// Body: { credential } — the GIS ID token.
// Requires env GOOGLE_CLIENT_ID (public value, also exposed as
// NEXT_PUBLIC_GOOGLE_CLIENT_ID for the button).
export async function POST(req: Request) {
  try {
    const { credential } = await req.json();
    if (!credential || typeof credential !== "string")
      return NextResponse.json({ error: "Missing Google credential." }, { status: 400 });
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) return NextResponse.json({ error: "Google login isn't configured on this deployment yet." }, { status: 500 });

    const v = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const info: any = await v.json().catch(() => ({}));
    if (!v.ok || !info?.email)
      return NextResponse.json({ error: "Google rejected this sign-in. Try again." }, { status: 401 });
    if (info.aud !== clientId)
      return NextResponse.json({ error: "Sign-in audience mismatch. Contact support." }, { status: 401 });
    if (info.email_verified !== "true")
      return NextResponse.json({ error: "That Google account isn't verified." }, { status: 401 });

    const email = String(info.email).toLowerCase();
    return NextResponse.json({ ok: true, email, session: signSession(email) });
  } catch {
    return NextResponse.json({ error: "Google sign-in failed. Try again." }, { status: 500 });
  }
}
