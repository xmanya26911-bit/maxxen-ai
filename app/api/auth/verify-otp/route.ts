import { NextResponse } from "next/server";
import { otpStore, purgeExpired, OTP_TTL_MS, checkTicketRateLimit, recordTicketAttempt, isTicketUsed, markTicketUsed } from "@/lib/otp-store";
import { checkTicket } from "@/lib/otp-crypto";
import { signSession } from "@/lib/session";
export async function POST(req: Request) {
  const { email, code, ticket } = await req.json();
  const key = String(email ?? "").toLowerCase();
  const clean = String(code ?? "").trim();
  if (!key || !/^\S+@\S+\.\S+$/.test(key) || !clean || clean.length > 20) return NextResponse.json({ error: "Valid email + code required." }, { status: 400 });
  const done = (ticketStr?: string) => {
    otpStore.delete(key);
    if (ticketStr) markTicketUsed(ticketStr, OTP_TTL_MS);
    return NextResponse.json({ ok: true, email: key, session: signSession(key) });
  };
  if (ticket) {
    const t = String(ticket);
    if (isTicketUsed(t)) return NextResponse.json({ error: "Code already used — request a new one." }, { status: 401 });
    if (!checkTicketRateLimit(key, t)) return NextResponse.json({ error: "Too many attempts — request a new code." }, { status: 429 });
    if (checkTicket(t, key, clean)) return done(t);
    recordTicketAttempt(key, t, OTP_TTL_MS);
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }
  purgeExpired();
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
  if (entry.code !== clean) return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  return done();
}