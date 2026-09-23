import { NextResponse } from "next/server";
import { otpStore, makeCode } from "@/lib/otp-store";
import { sendOtpMail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    const code = makeCode();
    otpStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
    await sendOtpMail(email, code);
    return NextResponse.json({ ok: true, message: "OTP sent" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Send failed. Check OUTLOOK_EMAIL/PASSWORD." }, { status: 500 });
  }
}
