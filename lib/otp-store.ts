// In-memory OTP store for MVP.
// For production on Vercel (multi-instance), swap with Upstash Redis / Vercel KV.
type Entry = { code: string; expiresAt: number; attempts: number };
const g = globalThis as any;
if (!g.__maxxenOtp) g.__maxxenOtp = new Map<string, Entry>();
export const otpStore: Map<string, Entry> = g.__maxxenOtp;

export function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
