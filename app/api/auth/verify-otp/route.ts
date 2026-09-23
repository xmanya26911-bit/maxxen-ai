import { NextResponse } from "next/server";
import { otpStore } from "@/lib/otp-store";
import { checkTicket, ticketFreshFor } from "@/lib/otp-crypto";

export async function POST(req: Request) {
  const { email, code, ticket } = await req.json();
  const key = String(email ?? "").toLowerCase();
  const clean = String(code ?? "").trim();
  const done = () => {
    otpStore.delete(key);
    return NextResponse.json({ ok: true, email: key, session: Buffer.from(`${key}:${Date.now()}`).toString("base64") });
  };
  if (ticket && checkTicket(String(ticket), key, clean)) return done();
  if (ticket && ticketFreshFor(String(ticket), key))
    return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
  const entry = otpStore.get(key);
  if (!entry) return NextResponse.json({ error: "No code sent. Request a new one." }, { status: 400 });
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return NextResponse.json({ error: "Code expired" }, { status: 400 });
  }
  entry.attempts++;
  if (entry.attempts > 5) {
    otpStore.delete(key);
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  if (entry.code !== clean) {
    return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
  }
  return done();
}
