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

// Sessions are HMAC-signed and carry their own expiry (default 7 days).
// Format: base64url(email|exp|sig). Tamper-evident; verified server-side.
// There is no server-side revocation list (stateless design), so the TTL is
// the ONLY bound on a stolen token: keep it short. Full revocation (logout-
// everywhere / password change) needs a persistent store and is future work.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let warnedWeakSecret = false;
/** 7-day sessions make JWT-style "wait for expiry" attacks cheap; warn loudly
 *  in production when signing with the Gmail fallback instead of OTP_SECRET. */
function warnOnceIfWeakSecret(secret: string) {
  if (warnedWeakSecret) return;
  if (process.env.NODE_ENV === "production" && !process.env.OTP_SECRET && secret) {
    warnedWeakSecret = true;
    console.error(
      "[maxxen] SECURITY: OTP_SECRET is unset — session HMAC is signing with the Gmail app password fallback. Set OTP_SECRET in the environment."
    );
  }
}

export function signSession(email: string, ttlMs = SESSION_TTL_MS) {
  const e = email.toLowerCase();
  const exp = Date.now() + ttlMs;
  const secret = serverSecret();
  warnOnceIfWeakSecret(secret);
  const sig = crypto.createHmac("sha256", secret).update(`${e}|${exp}`).digest("hex");
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


/** Return the authenticated email from the signed MAXXEN session header. */
export function sessionEmail(req: Request): string | null {
  const token = req.headers.get("x-maxxen-session") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return verifySession(token);
}
