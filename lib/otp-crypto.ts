import crypto from "crypto";
import { OTP_TTL_MS } from "./otp-store";

// Stateless OTP tickets for serverless (Vercel runs each request on any
// instance, so in-memory Maps don't survive). The ticket proves: this code
// was issued for this email and hasn't expired — verified by HMAC, no DB.
function key() {
  return (
    process.env.OTP_SECRET ||
    (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "") ||
    "maxxen-dev-only"
  );
}

export function issueTicket(email: string, code: string, ttlMs = OTP_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const data = `${email.toLowerCase()}|${exp}|${code}`;
  const sig = crypto.createHmac("sha256", key()).update(data).digest("hex");
  return Buffer.from(`${email.toLowerCase()}|${exp}|${sig}`).toString("base64url");
}

export function ticketFreshFor(ticket: string, email: string): boolean {
  try {
    const cleanTicket = String(ticket).replace(/^﻿/, "").trim();
    const parts = Buffer.from(cleanTicket, "base64url").toString().split("|");
    if (parts.length !== 3) return false;
    const [tEmail, tExp] = parts;
    if (tEmail !== String(email).toLowerCase()) return false;
    if (!tExp || Date.now() > Number(tExp)) return false;
    return true;
  } catch {
    return false;
  }
}

export function checkTicket(ticket: string, email: string, code: string): boolean {
  try {
    const cleanTicket = String(ticket).replace(/^﻿/, "").trim();
    const parts = Buffer.from(cleanTicket, "base64url").toString().split("|");
    if (parts.length !== 3) return false;
    const [tEmail, tExp, tSig] = parts;
    if (tEmail !== String(email).toLowerCase()) return false;
    if (!tExp || Date.now() > Number(tExp)) return false;
    const data = `${tEmail}|${tExp}|${String(code).trim()}`;
    const expect = crypto.createHmac("sha256", key()).update(data).digest("hex");
    if (expect.length !== tSig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(tSig));
  } catch {
    return false;
  }
}
