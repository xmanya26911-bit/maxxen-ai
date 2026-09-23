import { NextResponse } from "next/server";
import { otpStore, makeCode } from "@/lib/otp-store";
import { issueTicket } from "@/lib/otp-crypto";
import { sendOtpMail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    const code = makeCode();
    try {
      await sendOtpMail(email, code);
    } catch (e: any) {
      const raw = e.message ?? "";
      if (/535|authentication unsuccessful/i.test(raw))
        return NextResponse.json(
          { error: "Gmail blocked the login. Fix: use a Google App Password in GMAIL_APP_PASSWORD (not your normal password) with 2-Step Verification on." },
          { status: 500 }
        );
      return NextResponse.json({ error: raw || "Send failed. Check GMAIL_EMAIL/GMAIL_APP_PASSWORD." }, { status: 500 });
    }
    otpStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
    return NextResponse.json({ ok: true, message: "OTP sent", ticket: issueTicket(email, code) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Send failed. Check GMAIL_EMAIL/GMAIL_APP_PASSWORD." }, { status: 500 });
  }
}
