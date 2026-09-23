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
  return String(Math.floor(100000 + Math.random() * 900000));
}
