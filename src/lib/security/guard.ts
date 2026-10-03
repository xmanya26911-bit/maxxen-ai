import { verifySession } from "@/lib/session";

/**
 * Session security seam.
 *
 * A single abstraction for "who is calling this route", so enforcement can be
 * switched on later WITHOUT redesigning routes. It reuses the existing session
 * primitive (HMAC-signed token in lib/session) — it does NOT introduce a second
 * auth system.
 *
 * Token transport, in priority order:
 *   1. `x-maxxen-session` request header
 *   2. `Authorization: Bearer <token>`
 *   3. `body.session` (when the caller passes the parsed body)
 *
 * NOTE: session tokens and credentials are never logged here.
 */

export interface SessionIdentity {
  email: string;
  token: string;
}

export type SessionCheck =
  | { ok: true; identity: SessionIdentity }
  | { ok: false; reason: "missing" | "invalid" };

/**
 * Every mutating/credential-bearing route requires a signed MAXXEN session
 * (verified by lib/session). Clients send it as the `x-maxxen-session`
 * header (or `body.session`); missing/invalid sessions are rejected before
 * any provider or GitHub call. The constant stays a named export so tests
 * and future flags can reference the seam in one place.
 */
export const SESSION_ENFORCED = true;

/** Verify a raw token string. */
export function sessionFromToken(token: unknown): SessionCheck {
  if (typeof token !== "string" || !token.trim()) return { ok: false, reason: "missing" };
  const email = verifySession(token);
  if (!email) return { ok: false, reason: "invalid" };
  return { ok: true, identity: { email, token: token.trim() } };
}

/** Extract a token from a request (header first, then an optional parsed body). */
export function extractSessionToken(request: Request, body?: unknown): string {
  const header = request.headers.get("x-maxxen-session");
  if (header && header.trim()) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  if (body && typeof body === "object" && typeof (body as { session?: unknown }).session === "string") {
    return String((body as { session?: string }).session).trim();
  }
  return "";
}

/** Resolve the caller's session from a request (+ optional parsed body). */
export function sessionFromRequest(request: Request, body?: unknown): SessionCheck {
  return sessionFromToken(extractSessionToken(request, body));
}

/** Convenience boolean for guards. */
export function hasValidSession(request: Request, body?: unknown): boolean {
  return sessionFromRequest(request, body).ok;
}
