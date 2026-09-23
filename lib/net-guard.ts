// Outbound-URL guard for BYOK endpoints. The product promise is "any custom
// URL", so we cannot allowlist providers — but we CAN refuse the shapes that
// make a server-side fetcher dangerous. Deterministic, zero false positives
// for legitimate public HTTPS APIs.
// Residual, stated openly: DNS-rebinding (a public name resolving to a
// private IP) is not checked here; the server only ever attaches the USER's
// own key to the USER's own URL, never service credentials.
const BAD_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.google", "169.254.169.254"]);

export function assertSafeBaseURL(raw: unknown, fallback: string): string {
  const s = (typeof raw === "string" ? raw : "").trim() || fallback;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("Base URL is not a valid URL.");
  }
  if (u.protocol !== "https:") throw new Error("Base URL must use https.");
  if (u.username || u.password) throw new Error("Base URL must not embed credentials.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new Error("Base URL has no host.");
  if (BAD_HOSTS.has(host) || host === "[::1]" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error("Base URL host is not allowed.");
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((n) => n > 255)) throw new Error("Base URL host is not allowed.");
    const [a, b] = o;
    const blocked = a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
    if (blocked || a >= 224) throw new Error("Base URL host is not allowed.");
  }
  return u.toString().replace(/\/$/, "");
}
