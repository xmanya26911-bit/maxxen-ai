// Outbound-URL guard for BYOK endpoints. The product promise is "any custom
// URL", so we cannot allowlist providers — but we CAN refuse the shapes that
// make a server-side fetcher dangerous. Deterministic, zero false positives
// for legitimate public HTTPS APIs.
// Residual, stated openly: DNS-rebinding (a public name resolving to a
// private IP) is not checked here; the server only ever attaches the USER's
// own key to the USER's own URL, never service credentials.
const BAD_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.google", "169.254.169.254", "metadata.google.internal.", "instance-data", "instance-data-compute"]);

const BAD_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp", ".localdomain", ".intranet", ".invalid"];

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
  if (BAD_HOSTS.has(host)) throw new Error("Base URL host is not allowed.");
  for (const suf of BAD_SUFFIXES) {
    if (host === suf.slice(1) || host.endsWith(suf)) throw new Error("Base URL host is not allowed.");
  }
  // IPv4 literal: validate now, skip DNS TLD checks.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((n) => n > 255)) throw new Error("Base URL host is not allowed.");
    const [a, b] = o;
    const blocked = a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || a >= 224;
    if (blocked) throw new Error("Base URL host is not allowed.");
    return u.toString().replace(/\/$/, "");
  }
  // IPv6: block all (loopback, link-local, unique-local, mapped, public).
  // Public IPv6 LLM endpoints are vanishingly rare; blocking reduces SSRF surface.
  // Node URL keeps brackets in hostname? Normalize: strip [].
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6.includes(":")) {
    throw new Error("Base URL host is not allowed.");
  }
  // Single-label / no-dot hostnames (intranet, router, myserver) — block.
  if (!host.includes(".")) throw new Error("Base URL must be a public DNS name with a dot.");
  // TLD allowlist-lite: must look like a public domain (2+ char TLD, alnum/hyphen).
  // Skip numeric TLDs (already handled IPv4 above; remaining numeric = invalid).
  const tld = host.split(".").pop() || "";
  if (tld.length < 2 || !/^[a-z0-9-]+$/.test(tld) || /^\d+$/.test(tld)) throw new Error("Base URL host is not allowed.");
  return u.toString().replace(/\/$/, "");
}
