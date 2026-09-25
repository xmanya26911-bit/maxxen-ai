import { NextResponse } from "next/server";
import { otpStore, makeCode, purgeExpired, OTP_TTL_MS } from "@/lib/otp-store";
import { issueTicket } from "@/lib/otp-crypto";
import { sendOtpMail } from "@/lib/mailer";
export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const normalized = String(email ?? "").toLowerCase().trim();
    if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 254) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    const { checkSendRateLimit } = await import("@/lib/otp-store");
    if (!checkSendRateLimit(normalized)) return NextResponse.json({ error: "Too many codes sent — wait 10 minutes and try again." }, { status: 429 });
    const code = makeCode();
    try {
      await sendOtpMail(normalized, code);
    } catch (e: any) {
      const raw = e.message ?? "";
      if (/535|authentication unsuccessful/i.test(raw)) return NextResponse.json({ error: "Gmail blocked the login. Use a Google App Password with 2-Step Verification on." }, { status: 500 });
      return NextResponse.json({ error: raw || "Send failed. Check GMAIL_EMAIL/GMAIL_APP_PASSWORD." }, { status: 500 });
    }
    purgeExpired();
    otpStore.set(normalized, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    return NextResponse.json({ ok: true, message: "OTP sent", ticket: issueTicket(normalized, code) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Send failed." }, { status: 500 });
  }
}