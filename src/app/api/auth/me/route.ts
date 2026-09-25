import { NextResponse } from "next/server";
import { verifySession } from "@/lib/session";

// Validates the caller's session (HMAC-signed, 30-day expiry).
// Body: { session }. Returns { ok, email } or 401.
export async function POST(req: Request) {
  try {
    const { session } = await req.json();
    const email = verifySession(String(session || ""));
    if (!email) return NextResponse.json({ error: "Session expired or invalid. Please log in again." }, { status: 401 });
    return NextResponse.json({ ok: true, email });
  } catch {
    return NextResponse.json({ error: "Session check failed." }, { status: 400 });
  }
}
