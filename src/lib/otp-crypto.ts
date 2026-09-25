import crypto from "crypto";
import { OTP_TTL_MS } from "./otp-store";
import { serverSecret } from "./session";

// Stateless OTP tickets for serverless (Vercel runs each request on any
// instance, so in-memory Maps don't survive). The ticket proves: this code
// was issued for this email and hasn't expired — verified by HMAC, no DB.
function key() {
  return serverSecret();
}

export function issueTicket(email: string, code: string, ttlMs = OTP_TTL_MS) {
  const e = email.toLowerCase();
  const exp = Date.now() + ttlMs;
  const cleanCode = String(code).trim();
  const codeSig = crypto.createHmac("sha256", key()).update(`${e}|${exp}|${cleanCode}`).digest("hex");
  // freshSig proves "this ticket was issued for this email+exp" without revealing code.
  // ticketFreshFor() verifies freshSig, so forged tickets no longer pass freshness checks.
  const freshSig = crypto.createHmac("sha256", key()).update(`${e}|${exp}|fresh`).digest("hex");
  return Buffer.from(`${e}|${exp}|${codeSig}|${freshSig}`).toString("base64url");
}

function parseExp(tExp: string): number | null {
  if (!tExp) return null;
  const n = Number(tExp);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function ticketFreshFor(ticket: string, email: string): boolean {
  try {
    const cleanTicket = String(ticket).replace(/^﻿/, "").trim();
    const parts = Buffer.from(cleanTicket, "base64url").toString().split("|");
    const e = String(email).toLowerCase();
    // New 4-part tickets: verify freshSig (HMAC, no oracle).
    if (parts.length === 4) {
      const [tEmail, tExp, , tFresh] = parts;
      if (tEmail !== e) return false;
      const exp = parseExp(tExp);
      if (exp === null || Date.now() > exp) return false;
      const expectFresh = crypto.createHmac("sha256", key()).update(`${tEmail}|${tExp}|fresh`).digest("hex");
      if (expectFresh.length !== tFresh.length) return false;
      return crypto.timingSafeEqual(Buffer.from(expectFresh), Buffer.from(tFresh));
    }
    // Old 3-part tickets: cannot verify freshness without code — fail closed.
    return false;
  } catch {
    return false;
  }
}
export function checkTicket(ticket: string, email: string, code: string): boolean {
  try {
    const cleanTicket = String(ticket).replace(/^﻿/, "").trim();
    const parts = Buffer.from(cleanTicket, "base64url").toString().split("|");
    const e = String(email).toLowerCase();
    // New format
    if (parts.length === 4) {
      const [tEmail, tExp, tSig, tFresh] = parts;
      if (tEmail !== e) return false;
      const exp = parseExp(tExp);
      if (exp === null || Date.now() > exp) return false;
      // verify freshness first (fail fast on forged tickets)
      const expectFresh = crypto.createHmac("sha256", key()).update(`${tEmail}|${tExp}|fresh`).digest("hex");
      if (expectFresh.length !== tFresh.length) return false;
      if (!crypto.timingSafeEqual(Buffer.from(expectFresh), Buffer.from(tFresh))) return false;
      const data = `${tEmail}|${tExp}|${String(code).trim()}`;
      const expect = crypto.createHmac("sha256", key()).update(data).digest("hex");
      if (expect.length !== tSig.length) return false;
      return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(tSig));
    }
    // Legacy 3-part (transitional, 10-min window): verify as before, with finite-exp check.
    if (parts.length === 3) {
      const [tEmail, tExp, tSig] = parts;
      if (tEmail !== e) return false;
      const exp = parseExp(tExp);
      if (exp === null || Date.now() > exp) return false;
      const data = `${tEmail}|${tExp}|${String(code).trim()}`;
      const expect = crypto.createHmac("sha256", key()).update(data).digest("hex");
      if (expect.length !== tSig.length) return false;
      return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(tSig));
    }
    return false;
  } catch {
    return false;
  }
}
