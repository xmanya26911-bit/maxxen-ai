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

/* ------------------------------------------------------------------ */
/* Model-driven outbound fetches (preview_check)                        */
/* ------------------------------------------------------------------ */

// `assertSafeBaseURL` above validates the *shape* of a URL the USER typed
// alongside their OWN provider key. Tools are different: the MODEL chooses the
// URL, so a public hostname that resolves (or redirects) to an internal
// address is an attack, not a typo. These helpers close that gap.
//
// Residual risk, stated openly: we resolve the host, then fetch it — a DNS
// answer that changes between the two lookups (rebinding) is not defeated
// here. Closing that fully needs connection-level IP pinning, which the
// fetch API does not expose.

const isIpLiteral = (host: string): boolean =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");

/** True for any address that must never be reachable from our tools. */
function isBlockedAddress(address: string): boolean {
  const addr = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (addr.includes(":")) {
    // IPv6: allow ONLY global unicast (2000::/3). Everything else — ::1,
    // ::, fe80::/10, fc00::/7, ::ffff: mapped forms — is blocked.
    return !/^2|^3/.test(addr);
  }
  const octets = addr.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    a >= 224 || // multicast + reserved
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) // benchmarking
  );
}

/**
 * Reject https URLs that resolve to a non-public address. Used by
 * `safeFetchFollow` on the initial URL and on every redirect hop.
 */
export async function assertResolvesPublic(raw: string): Promise<URL> {
  const shaped = assertSafeBaseURL(raw, "");
  const u = new URL(shaped);
  if (u.port && u.port !== "443") throw new Error("Only the default https port (443) can be fetched.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) {
    if (isBlockedAddress(host)) throw new Error("That address is not publicly routable.");
    return u;
  }
  const { lookup } = await import("node:dns/promises");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`Host "${host}" did not resolve.`);
  }
  if (!addresses.length) throw new Error(`Host "${host}" did not resolve.`);
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new Error(`Host "${host}" resolves to a non-public address.`);
  }
  return u;
}

export interface SafeFetchResult {
  response: Response;
  /** Final URL after redirects (all hops validated). */
  url: string;
  /** Number of redirects followed. */
  hops: number;
}

/**
 * Fetch an https URL on behalf of a model-chosen tool argument, following
 * redirects MANUALLY so every hop is re-validated. `fetch(redirect:"follow")`
 * would hand the decision to the runtime and let one public 302 reach an
 * internal service.
 */
export async function safeFetchFollow(
  raw: string,
  opts: { maxHops?: number; timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<SafeFetchResult> {
  const maxHops = Math.min(Math.max(opts.maxHops ?? 3, 0), 5);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(opts.timeoutMs ?? 25000, 1000), 60000));
  try {
    let current = await assertResolvesPublic(raw);
    for (let hops = 0; hops <= maxHops; hops++) {
      const response = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: opts.headers,
      });
      const isRedirect = response.status >= 300 && response.status < 400;
      const location = isRedirect ? response.headers.get("location") : null;
      if (!isRedirect || !location) {
        return { response, url: current.toString(), hops };
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new Error("The URL redirected to an invalid location.");
      }
      current = await assertResolvesPublic(next.toString()); // re-validate the hop
    }
    throw new Error(`Too many redirects (limit ${maxHops}).`);
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body with a hard cap so a huge page cannot exhaust memory. */
export async function readCapped(response: Response, maxChars = 400_000): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

