import crypto from "crypto";
import { OTP_TTL_MS } from "./otp-store";
import { serverSecret } from "./session";

function key() {
  return serverSecret();
}

export function issueTicket(email: string, code: string, ttlMs = OTP_TTL_MS) {
  const e = email.toLowerCase();
  const exp = Date.now() + ttlMs;
  const cleanCode = String(code).trim();
  const codeSig = crypto.createHmac("sha256", key()).update(e + "|" + exp + "|" + cleanCode).digest("hex");
  const freshSig = crypto.createHmac("sha256", key()).update(e + "|" + exp + "|fresh").digest("hex");
  return Buffer.from(e + "|" + exp + "|" + codeSig + "|" + freshSig).toString("base64url");
}

function parseExp(tExp: string): number | null {
  if (!tExp) return null;
  const n = Number(tExp);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function ticketFreshFor(ticket: string, email: string): boolean {
  try {
    const cleanTicket = String(ticket).trim();
    const parts = Buffer.from(cleanTicket, "base64url").toString().split("|");
    const e = String(email).toLowerCase();
    if (parts.length === 4) {
      const tEmail = parts[0];
      const tExp = parts[1];
      const tFresh = parts[3];
      if (tEmail !== e) return false;
      const exp = parseExp(tExp);
      if (exp === null || Date.now() > exp) return false;
      const expectFresh = crypto.createHmac("sha256", key()).update(tEmail + "|" + tExp + "|fresh").digest("hex");
      if (expectFresh.length !== tFresh.length) return false;
      return crypto.timingSafeEqual(Buffer.from(expectFresh), Buffer.from(tFresh));
    }
    return false;
  } catch {
    return false;
  }
}

export function checkTicket(ticket: string, email: string, code: string): boolean {
  try {
    const cleanTicket = String(ticket).trim();
    const parts = Buffer.from(cleanTicket, "base64url").toString().split("|");
    const e = String(email).toLowerCase();
    if (parts.length === 4) {
      const tEmail = parts[0];
      const tExp = parts[1];
      const tSig = parts[2];
      const tFresh = parts[3];
      if (tEmail !== e) return false;
      const exp = parseExp(tExp);
      if (exp === null || Date.now() > exp) return false;
      const expectFresh = crypto.createHmac("sha256", key()).update(tEmail + "|" + tExp + "|fresh").digest("hex");
      if (expectFresh.length !== tFresh.length) return false;
      if (!crypto.timingSafeEqual(Buffer.from(expectFresh), Buffer.from(tFresh))) return false;
      const data = tEmail + "|" + tExp + "|" + String(code).trim();
      const expect = crypto.createHmac("sha256", key()).update(data).digest("hex");
      if (expect.length !== tSig.length) return false;
      return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(tSig));
    }
    if (parts.length === 3) {
      const tEmail = parts[0];
      const tExp = parts[1];
      const tSig = parts[2];
      if (tEmail !== e) return false;
      const exp = parseExp(tExp);
      if (exp === null || Date.now() > exp) return false;
      const data = tEmail + "|" + tExp + "|" + String(code).trim();
      const expect = crypto.createHmac("sha256", key()).update(data).digest("hex");
      if (expect.length !== tSig.length) return false;
      return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(tSig));
    }
    return false;
  } catch {
    return false;
  }
}