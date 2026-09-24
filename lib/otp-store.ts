// Fallback store only (primary path is stateless tickets — zero server storage).
// Entries live max 10 minutes: expired ones are purged on every auth request
// and successful/failed-terminal verifies delete immediately, so memory stays tiny.
type Entry = { code: string; expiresAt: number; attempts: number };
const g = globalThis as any;
if (!g.__maxxenOtp) g.__maxxenOtp = new Map<string, Entry>();
export const otpStore: Map<string, Entry> = g.__maxxenOtp;

export const OTP_TTL_MS = 10 * 60 * 1000;

export function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of otpStore) {
    if (v.expiresAt <= now) otpStore.delete(k);
  }
}

export function makeCode() {
  // crypto-secure 6-digit code (no Math.random predictability)
  const { randomInt } = require("crypto") as typeof import("crypto");
  return String(randomInt(100000, 1000000));
}

// --- Stateless-ticket brute-force + replay guards (serverless-safe in-memory) ---
// These are best-effort per-instance limits + single-use tracking. They raise
// the bar significantly vs unlimited attempts, even though a fully distributed
// limiter (Upstash/Vercel KV) is still recommended for production scale.
type TicketGuard = { count: number; expiresAt: number };
const tg = globalThis as any;
if (!tg.__maxxenTicketAttempts) tg.__maxxenTicketAttempts = new Map<string, TicketGuard>();
if (!tg.__maxxenUsedTickets) tg.__maxxenUsedTickets = new Map<string, number>();
export const ticketAttempts: Map<string, TicketGuard> = tg.__maxxenTicketAttempts;
export const usedTickets: Map<string, number> = tg.__maxxenUsedTickets;

export function ticketKey(email: string, ticket: string) {
  // bind attempts to email + ticket so one attacker can't burn another user's budget
  return `${email.toLowerCase()}|${String(ticket).slice(0, 128)}`;
}

export function checkTicketRateLimit(email: string, ticket: string): boolean {
  const now = Date.now();
  // purge expired
  for (const [k, v] of ticketAttempts) if (v.expiresAt <= now) ticketAttempts.delete(k);
  for (const [k, exp] of usedTickets) if (exp <= now) usedTickets.delete(k);
  const k = ticketKey(email, ticket);
  const cur = ticketAttempts.get(k);
  if (cur && cur.count >= 6) return false; // 6 tries per ticket, then must request new code
  return true;
}

export function recordTicketAttempt(email: string, ticket: string, ttlMs: number) {
  const k = ticketKey(email, ticket);
  const cur = ticketAttempts.get(k);
  const expiresAt = Date.now() + ttlMs;
  if (!cur) ticketAttempts.set(k, { count: 1, expiresAt });
  else ticketAttempts.set(k, { count: cur.count + 1, expiresAt: Math.max(cur.expiresAt, expiresAt) });
}

export function isTicketUsed(ticket: string) {
  const exp = usedTickets.get(String(ticket));
  if (!exp) return false;
  if (exp <= Date.now()) {
    usedTickets.delete(String(ticket));
    return false;
  }
  return true;
}

export function markTicketUsed(ticket: string, ttlMs: number) {
  usedTickets.set(String(ticket), Date.now() + ttlMs);
  // free attempt budget on success
  for (const [k] of ticketAttempts) {
    if (k.endsWith(`|${String(ticket).slice(0, 128)}`)) ticketAttempts.delete(k);
  }
}

// Simple per-email send-otp rate limit: 5 sends / 10 min per instance.
const sg = globalThis as any;
if (!sg.__maxxenSendLimits) sg.__maxxenSendLimits = new Map<string, { count: number; windowStart: number }>();
export const sendLimits: Map<string, { count: number; windowStart: number }> = sg.__maxxenSendLimits;

export function checkSendRateLimit(email: string): boolean {
  const now = Date.now();
  const k = email.toLowerCase();
  const cur = sendLimits.get(k);
  const WINDOW = 10 * 60 * 1000;
  if (!cur || now - cur.windowStart > WINDOW) {
    sendLimits.set(k, { count: 1, windowStart: now });
    return true;
  }
  if (cur.count >= 5) return false;
  cur.count++;
  return true;
}
