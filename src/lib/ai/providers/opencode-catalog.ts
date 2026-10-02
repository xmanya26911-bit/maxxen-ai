/**
 * OpenCode model catalog — dynamic discovery over the documented inference API.
 *
 * Live catalog (authoritative): GET https://opencode.ai/inference/v1/models
 * returns an OpenAI-style `{ object: "list", data: [{ id }] }` payload. That
 * payload carries NO free/paid flags, NO API-family field and NO capability
 * flags, so enrichment below is derived from OpenCode's DOCUMENTED conventions:
 *
 * - Inference guide (opencode.ai/console/guides/inference + /v2/docs/console/inference):
 *   "Free chat models can be called without [an auth] header. Paid models
 *   require it." Free chat models use the Chat Completions API; GPT models use
 *   the Responses API; Claude and Qwen use the Messages API; Gemini models use
 *   the Gemini path.
 * - Zen model table (opencode.ai/docs/zen) maps each model id to its endpoint
 *   family (chat/completions, responses, per-model paths, systemone).
 *
 * Rules derived from the above (kept in code, not in prose, so the UI picks
 * up catalog changes without a release):
 * - `free`  := id ends with `-free` OR id is in FALLBACK_FREE_IDS.
 * - `family` := responses for the gpt-, grok- and muse-spark- prefixes;
 *   anthropic for the claude- and qwen prefixes; gemini for the gemini-
 *   prefix; unsupported for jev- (systemone is not a documented public HTTP
 *   protocol); openai-chat for everything else.
 *
 * FALLBACK_FREE_IDS exists ONLY because the live endpoint omits flags: if
 * discovery fails we still offer the last documented free set instead of
 * offering nothing. It is versioned (FALLBACK_REV) and MUST be refreshed
 * whenever the docs change — never silently treated as exhaustive.
 *
 * Isomorphic and dependency-free: safe to import from client components,
 * server routes, and unit tests. Never touches credentials, cookies, or any
 * OpenCode local state — only the documented public HTTPS endpoints.
 */

export const OPENCODE_ORIGIN = "https://opencode.ai";
export const OPENCODE_MODELS_URL = `${OPENCODE_ORIGIN}/inference/v1/models`;
export const OPENCODE_CHAT_URL = `${OPENCODE_ORIGIN}/inference/openai/v1/chat/completions`;
export const OPENCODE_RESPONSES_URL = `${OPENCODE_ORIGIN}/inference/openai/v1/responses`;
export const OPENCODE_ANTHROPIC_URL = `${OPENCODE_ORIGIN}/inference/anthropic/v1/messages`;
export const OPENCODE_GEMINI_URL = (model: string, stream: boolean) =>
  `${OPENCODE_ORIGIN}/inference/google/v1beta/models/${encodeURIComponent(model)}:${
    stream ? "streamGenerateContent" : "generateContent"
  }`;

export type OpenCodeApiFamily =
  | "openai-chat"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "unsupported";

export interface OpenCodeModel {
  id: string;
  /** Human label, e.g. "MiMo V2.5 Free". */
  name: string;
  free: boolean;
  family: OpenCodeApiFamily;
  /** True when a request for this model must carry an OpenCode key. */
  authRequired: boolean;
  /** Honest, family-level capabilities only (the catalog exposes no per-model flags). */
  capabilities: string[];
}

/** Catalog cache TTL: the model list changes rarely; an hour keeps the picker fresh. */
export const CATALOG_TTL_MS = 60 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 15_000;

/**
 * Versioned fallback free set. WHY: the live /v1/models payload has no
 * free/paid flags, so when discovery is unreachable we fall back to the free
 * ids OpenCode documents (inference guide + zen table) instead of an empty
 * picker. Refresh FALLBACK_REV + this list when the docs change.
 */
export const FALLBACK_REV = 1;
export const FALLBACK_FREE_IDS: readonly string[] = [
  "mimo-v2.5-free",
  "mimo-v2.6-flash-free",
  "ling-3.0-flash-fin-free",
  "longcat-2.5-preview-free",
  "space-bunny-free",
  "nemotron-3-ultra-free",
  "nemotron-3.5-lightning-free",
  "muse-spark-1.3-contributor-free",
  "jev-1.13-free",
  "big-pickle",
];

/** Credential-free error (safe to surface to the user and to logs). */
export class OpenCodeError extends Error {
  status?: number;
  retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "OpenCodeError";
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

const FREE_SUFFIX = /-free$/;

export function isFreeModelId(id: string): boolean {
  const v = (id || "").trim();
  return FREE_SUFFIX.test(v) || (FALLBACK_FREE_IDS as readonly string[]).includes(v);
}

/**
 * API family from the documented per-model endpoint mapping (zen table +
 * inference guide). `jev-` resolves to `unsupported`: its `systemone`
 * endpoint is not a documented public HTTP protocol, so we refuse rather
 * than guess a wire format.
 */
export function familyForModelId(id: string): OpenCodeApiFamily {
  const v = (id || "").trim().toLowerCase();
  if (!v) return "unsupported";
  if (/^(gpt-|grok-|muse-spark-)/.test(v)) return "openai-responses";
  if (/^(claude-|qwen)/.test(v)) return "anthropic";
  if (/^gemini-/.test(v)) return "gemini";
  if (/^jev-/.test(v)) return "unsupported";
  return "openai-chat";
}

/**
 * Whether a request for this model must carry the user's OpenCode key.
 *
 * Currently ALWAYS true: since 2026-09-16 OpenCode rejects free-tier calls
 * from outside the official OpenCode client (403 FreeTierError, "can only be
 * used from within OpenCode" — even with a valid account key, per
 * anomalyco/opencode#49433/#49596/#49609). Spoofing the client to dodge the
 * gate would be impersonation, so Maxxen requires the caller's own key for
 * every OpenCode model and only offers paid models for actual use. Kept as a
 * function (not a constant) so the gate can relax if upstream re-opens.
 */
export function modelNeedsKey(id: string): boolean {
  void id;
  return true;
}

/** "mimo-v2.5-free" -> "MiMo V2.5 Free". Purely presentational. */
export function displayNameFor(id: string): string {
  return id
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function capabilitiesForFamily(family: OpenCodeApiFamily): string[] {
  switch (family) {
    case "openai-chat":
      return ["chat", "streaming"];
    case "openai-responses":
      return ["chat", "streaming"];
    case "anthropic":
      return ["chat", "streaming"];
    case "gemini":
      return ["chat", "streaming"];
    default:
      return [];
  }
}

export function enrichModel(id: string): OpenCodeModel {
  const clean = (id || "").trim();
  const free = isFreeModelId(clean);
  const family = familyForModelId(clean);
  return {
    id: clean,
    name: displayNameFor(clean),
    free,
    family,
    authRequired: !free,
    capabilities: capabilitiesForFamily(family),
  };
}

/** Parse the live catalog payload. Throws OpenCodeError on bad shapes. */
export function parseCatalog(payload: unknown): OpenCodeModel[] {
  const data = Array.isArray(payload)
    ? payload
    : (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new OpenCodeError("OpenCode model catalog is malformed (expected { data: [{ id }] }).", {
      retryable: false,
    });
  }
  const seen = new Set<string>();
  const out: OpenCodeModel[] = [];
  for (const entry of data) {
    const id = typeof entry === "string" ? entry : (entry as { id?: unknown })?.id;
    if (typeof id !== "string" || !id.trim() || seen.has(id.trim())) continue;
    seen.add(id.trim());
    out.push(enrichModel(id));
  }
  if (!out.length) {
    throw new OpenCodeError("OpenCode model catalog is empty.", { retryable: true });
  }
  return freeFirst(out);
}

/** Free models first (stable), then alphabetical — the picker's canonical order. */
export function freeFirst(models: OpenCodeModel[]): OpenCodeModel[] {
  return [...models].sort(
    (a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id)
  );
}

/** Fallback catalog built from the documented free set (used only when live discovery fails). */
export function fallbackCatalog(): OpenCodeModel[] {
  return freeFirst(FALLBACK_FREE_IDS.map(enrichModel));
}

interface CatalogCache {
  at: number;
  models: OpenCodeModel[];
  source: "live" | "fallback";
}

let cache: CatalogCache | null = null;

function timeoutSignal(ms: number, upstream?: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  // No unref(): DOM-typed setTimeout returns a number, and the timer is
  // always cleared on abort or superseded by cache/fallback paths.
  const timer = setTimeout(() => ctrl.abort(new Error("OpenCode catalog request timed out.")), ms);
  const clear = () => clearTimeout(timer);
  ctrl.signal.addEventListener("abort", clear, { once: true });
  upstream?.addEventListener("abort", () => {
    clear();
    ctrl.abort(upstream.reason);
  });
  return ctrl.signal;
}

async function fetchOnce(
  fetcher: typeof fetch,
  signal: AbortSignal
): Promise<OpenCodeModel[]> {
  const res = await fetcher(OPENCODE_MODELS_URL, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
    throw new OpenCodeError(`OpenCode catalog unavailable (HTTP ${res.status}).`, {
      status: res.status,
      retryable: true,
    });
  }
  if (!res.ok) {
    throw new OpenCodeError(`OpenCode catalog request failed (HTTP ${res.status}).`, {
      status: res.status,
      retryable: false,
    });
  }
  const json = await res.json().catch(() => null);
  return parseCatalog(json);
}

/**
 * Live catalog with caching, one retry on rate-limit/server errors, and a
 * documented fallback. Never rejects when a stale cache or the fallback set
 * can serve the picker: returns { models, source } so callers can label it.
 */
export async function getCatalog(
  fetcher: typeof fetch = fetch,
  opts: { ttlMs?: number; signal?: AbortSignal } = {}
): Promise<{ models: OpenCodeModel[]; source: "live" | "fallback" | "stale"; fetchedAt: number }> {
  const ttl = opts.ttlMs ?? CATALOG_TTL_MS;
  if (cache && Date.now() - cache.at < ttl) {
    return { models: cache.models, source: cache.source === "live" ? "live" : "fallback", fetchedAt: cache.at };
  }
  const signal = timeoutSignal(CATALOG_TIMEOUT_MS, opts.signal);
  try {
    const models = await fetchOnce(fetcher, signal);
    cache = { at: Date.now(), models, source: "live" };
    return { models, source: "live", fetchedAt: cache.at };
  } catch (first) {
    // One retry for transient upstream pressure.
    if (first instanceof OpenCodeError && first.retryable) {
      await new Promise((r) => setTimeout(r, 750));
      try {
        const models = await fetchOnce(fetcher, timeoutSignal(CATALOG_TIMEOUT_MS, opts.signal));
        cache = { at: Date.now(), models, source: "live" };
        return { models, source: "live", fetchedAt: cache.at };
      } catch {
        /* fall through to stale/fallback */
      }
    }
    if (cache) return { models: cache.models, source: "stale", fetchedAt: cache.at };
    if (first instanceof OpenCodeError && !first.retryable && first.message.includes("malformed")) throw first;
    const models = fallbackCatalog();
    cache = { at: Date.now(), models, source: "fallback" };
    return { models, source: "fallback", fetchedAt: cache.at };
  }
}

/** Test seam: reset the in-memory catalog cache. */
export function __resetCatalogCache(): void {
  cache = null;
}

/**
 * Normalize an upstream HTTP failure into a user-safe message + retry hint.
 * Never includes headers, keys, or raw bodies (bodies may echo prompts).
 */
export function normalizeUpstreamError(status: number, detail: string): { message: string; retryable: boolean } {
  const d = (detail || "").slice(0, 300);
  switch (status) {
    case 401:
      return {
        message: `OpenCode rejected the key (401). ${d || "Re-paste your OpenCode key in Settings — free models need no key."}`,
        retryable: false,
      };
    case 403: {
      const gated = /freetiererror|from within opencode/i.test(d);
      if (gated)
        return {
          message:
            "OpenCode’s free tier only works inside the official OpenCode app (blocked upstream 2026-09-16). In Maxxen, use an OpenCode paid model with your own key, or pick another provider.",
          retryable: false,
        };
      return {
        message: `OpenCode refused this model (403). ${d || "The model may require a different plan or key scope."}`,
        retryable: false,
      };
    }
    case 404:
      return {
        message: `OpenCode has no such model or endpoint (404). ${d || "Refresh the model list — the catalog may have changed."}`,
        retryable: false,
      };
    case 429:
      return { message: "OpenCode rate limit reached. Try again later.", retryable: true };
    case 500:
    case 502:
    case 503:
      return { message: "OpenCode model is temporarily unavailable.", retryable: true };
    default:
      return {
        message: `OpenCode request failed${status ? ` (HTTP ${status})` : ""}. ${d}`.trim(),
        retryable: status >= 500,
      };
  }
}
