import crypto from "crypto";
import { OTP_TTL_MS } from "./otp-store";

// Single server-side secret primitive. Set OTP_SECRET in env for production;
// falls back to the Gmail app password (already a high-entropy server secret).
export function serverSecret() {
  const s =
    process.env.OTP_SECRET ||
    (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("Missing OTP_SECRET (or GMAIL_APP_PASSWORD) — refusing to sign with dev fallback.");
  return "maxxen-dev-only";
}

// Sessions are HMAC-signed and carry their own expiry (default 30 days).
// Format: base64url(email|exp|sig). Tamper-evident; verified server-side.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function signSession(email: string, ttlMs = SESSION_TTL_MS) {
  const e = email.toLowerCase();
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac("sha256", serverSecret()).update(`${e}|${exp}`).digest("hex");
  return Buffer.from(`${e}|${exp}|${sig}`).toString("base64url");
}

export function verifySession(token: string): string | null {
  try {
    const clean = String(token || "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!clean) return null;
    const parts = Buffer.from(clean, "base64url").toString().split("|");
    if (parts.length !== 3) return null;
    const [email, exp, sig] = parts;
    const expN = Number(exp);
    if (!email || !exp || !Number.isFinite(expN) || Date.now() > expN) return null;
    const expect = crypto.createHmac("sha256", serverSecret()).update(`${email}|${exp}`).digest("hex");
    if (expect.length !== sig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
    return email;
  } catch {
    return null;
  }
}
