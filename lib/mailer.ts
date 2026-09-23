import nodemailer from "nodemailer";

export function mailer() {
  const user = process.env.GMAIL_EMAIL!;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) throw new Error("Missing GMAIL_EMAIL / GMAIL_APP_PASSWORD env");
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export async function sendOtpMail(to: string, code: string) {
  const from = process.env.GMAIL_EMAIL!;
  await mailer().sendMail({
    from: `"Maxxen AI" <${from}>`,
    to,
    subject: `Your Maxxen AI code: ${code}`,
    text: `Your Maxxen AI verification code is ${code}. It expires in 10 minutes.`,
    html: `<div style="font-family:sans-serif;background:#0a0a16;padding:32px;color:#fff">
      <h1>Maxxen AI</h1><p>Your 6-digit code:</p>
      <div style="font-size:36px;letter-spacing:8px;font-weight:800">${code}</div>
      <p style="opacity:.6">Expires in 10 minutes. Never share this code.</p></div>`,
  });
}
