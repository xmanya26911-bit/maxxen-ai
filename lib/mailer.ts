import nodemailer from "nodemailer";

export function mailer() {
  const user = process.env.OUTLOOK_EMAIL!;
  const pass = process.env.OUTLOOK_PASSWORD!;
  if (!user || !pass) throw new Error("Missing OUTLOOK_EMAIL / OUTLOOK_PASSWORD env");
  return nodemailer.createTransport({
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

export async function sendOtpMail(to: string, code: string) {
  const from = process.env.OUTLOOK_EMAIL!;
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
