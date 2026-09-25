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
  const { randomInt } = require("crypto") as typeof import("crypto");
  return String(randomInt(100000, 1000000));
}

type TicketGuard = { count: number; expiresAt: number };
const tg = globalThis as any;
if (!tg.__maxxenTicketAttempts) tg.__maxxenTicketAttempts = new Map<string, TicketGuard>();
if (!tg.__maxxenUsedTickets) tg.__maxxenUsedTickets = new Map<string, number>();
export const ticketAttempts: Map<string, TicketGuard> = tg.__maxxenTicketAttempts;
export const usedTickets: Map<string, number> = tg.__maxxenUsedTickets;

export function ticketKey(email: string, ticket: string) {
  return email.toLowerCase() + "|" + String(ticket).slice(0, 128);
}

export function checkTicketRateLimit(email: string, ticket: string): boolean {
  const now = Date.now();
  for (const [k, v] of ticketAttempts) if (v.expiresAt <= now) ticketAttempts.delete(k);
  for (const [k, exp] of usedTickets) if (exp <= now) usedTickets.delete(k);
  const k = ticketKey(email, ticket);
  const cur = ticketAttempts.get(k);
  if (cur && cur.count >= 6) return false;
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
  for (const [k] of ticketAttempts) {
    if (k.endsWith("|" + String(ticket).slice(0, 128))) ticketAttempts.delete(k);
  }
}

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