/**
 * Auth API layer — REAL backend (Gmail OTP + Google + signed sessions).
 *
 * Wires the login UI to:
 *   requestOtp → POST /api/auth/send-otp { email } → { ticket }
 *   verifyOtp  → POST /api/auth/verify-otp { email, code, ticket } → { session }
 *   Google     → GIS ID token → POST /api/auth/google { credential } → { session }
 *
 * The OTP ticket is short-lived server state; this module holds it in memory
 * (per email) between the send and verify steps — it never touches storage.
 */

/** Lifetime of an emailed code — matches the product story ("10-minute OTP"). */
export const OTP_TTL_SECONDS = 10 * 60;
/** Quiet period before "Resend" becomes available. */
export const RESEND_COOLDOWN_SECONDS = 30;

export interface OtpChallenge {
  email: string;
  /** Seconds until the emailed code self-destructs. */
  ttlSeconds: number;
  /** Seconds before the resend action unlocks. */
  resendCooldownSeconds: number;
}

export class OtpExpiredError extends Error {
  constructor() {
    super("This code expired — resend a fresh one.");
    this.name = "OtpExpiredError";
  }
}

/** Pending server tickets, keyed by normalized email. Memory-only. */
const pendingTickets = new Map<string, string>();

/** Loose but practical email shape (the backend does authoritative validation). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function errorOf(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json) {
    const e = (json as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

/**
 * Step 1 — ask the backend to email a 6-digit code to `email`.
 * Resolves with the challenge metadata the UI needs (expiry + cooldown).
 */
export async function requestOtp(email: string): Promise<OtpChallenge> {
  const normalized = email.trim().toLowerCase();
  const res = await postJson("/api/auth/send-otp", { email: normalized });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ticket) {
    // A fresh send replaces any older ticket — drop it so verify can't reuse it.
    pendingTickets.delete(normalized);
    throw new Error(errorOf(json, "Couldn't send the code. Try again."));
  }
  pendingTickets.set(normalized, String(json.ticket));
  return {
    email: normalized,
    ttlSeconds: OTP_TTL_SECONDS,
    resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

/**
 * Step 2 — verify a 6-digit code. Resolves with the server session token.
 * Rejects with `OtpExpiredError` once the challenge window has lapsed.
 */
export async function verifyOtp(email: string, code: string): Promise<{ token: string }> {
  const normalized = email.trim().toLowerCase();
  const ticket = pendingTickets.get(normalized);
  const res = await postJson("/api/auth/verify-otp", {
    email: normalized,
    code: code.trim(),
    ticket,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.session) {
    throw new Error(errorOf(json, "That code didn't match. Check the 6 digits and try again."));
  }
  pendingTickets.delete(normalized);
  return { token: String(json.session) };
}

/** Clears any pending ticket (sign-out / switch-account hygiene). */
export function clearPendingTicket(email: string): void {
  pendingTickets.delete(email.trim().toLowerCase());
}

/**
 * Validates a stored server session. Returns the session email, or null when
 * the session is missing, expired, or invalid (caller should sign out).
 */
export async function validateSession(session: string): Promise<string | null> {
  if (!session) return null;
  try {
    const res = await postJson("/api/auth/me", { session });
    const json = await res.json().catch(() => null);
    if (!res.ok || typeof json?.email !== "string") return null;
    return json.email as string;
  } catch {
    return null;
  }
}

/** "9:58" / "0:07" — used by the expiry countdown chip. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
