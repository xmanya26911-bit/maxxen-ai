import { useAuthStore } from "./auth-store";

/**
 * Session header helper for MAXXEN API calls.
 *
 * Most /api routes enforce the signed session (lib/security/guard) and the
 * GitHub/memory routes additionally bind credentials to it — every client
 * fetch to those routes must include it. Returns {} when signed out so
 * callers can spread unconditionally.
 */
/** Session header map for MAXXEN API calls ({} when signed out). */
function sessionHeader(): Record<string, string> {
  const token = useAuthStore.getState().session?.token;
  return token ? { "x-maxxen-session": token } : {};
}

/** Merge the session header into an existing header map. */
export function withSession(headers: Record<string, string>): Record<string, string> {
  return { ...headers, ...sessionHeader() };
}
