import { NextResponse } from "next/server";
import { otpStore, makeCode } from "@/lib/otp-store";
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
      if (/535|SmtpClientAuthentication|authentication unsuccessful/i.test(raw))
        return NextResponse.json(
          { error: "Outlook blocked SMTP login (535). Fix: 1) enable 2FA on maxxen.app@outlook.com, 2) create an App Password, 3) enable Authenticated SMTP for the mailbox, 4) set OUTLOOK_PASSWORD to the App Password (not the normal password). See README SMTP section." },
          { status: 500 }
        );
      return NextResponse.json({ error: raw || "Send failed. Check OUTLOOK_EMAIL/PASSWORD." }, { status: 500 });
    }
    otpStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
    return NextResponse.json({ ok: true, message: "OTP sent" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Send failed. Check OUTLOOK_EMAIL/PASSWORD." }, { status: 500 });
  }
}
