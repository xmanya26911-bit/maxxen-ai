/**
 * Shared Composio helpers: key normalization + safe error extraction.
 *
 * Composio's v3 REST errors come in several shapes
 * ({ error: string } | { message: string } | { error: { message } } | …).
 * Naive string concatenation renders nested objects as "[object Object]",
 * which hides the actionable reason — always route errors through detail().
 */

/** Normalize a pasted key (trailing spaces/newlines are the #1 false reject). */
export function cleanComposioKey(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, "") : "";
}

function pickMessage(value: unknown, depth = 0): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && depth < 3) {
    const o = value as Record<string, unknown>;
    for (const k of ["message", "error", "detail", "description"]) {
      const found = pickMessage(o[k], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Human-readable Composio failure detail — never "[object Object]". */
export function composioErrorDetail(payload: unknown, status: number): string {
  const msg = pickMessage(payload);
  if (msg) return `HTTP ${status}: ${msg.slice(0, 300)}`;
  try {
    const raw = JSON.stringify(payload ?? {});
    if (raw && raw !== "{}") return `HTTP ${status}: ${raw.slice(0, 300)}`;
  } catch {
    /* fall through */
  }
  return `HTTP ${status}`;
}

/** Standard headers for Composio v3 REST (key in x-api-key, never in URL). */
export function composioHeaders(key: string): Record<string, string> {
  return { "x-api-key": key };
}

export interface ComposioExecOpts {
  connectedAccountId?: string;
  /** Explicit Composio user id (preferred when the caller knows it). */
  userId?: string;
  /** Fallback identity (e.g. the Maxxen session email) used only on retry. */
  email?: string;
}

export interface ComposioExecResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function postExecute(
  key: string,
  slug: string,
  args: unknown,
  extra: Record<string, unknown>
): Promise<ComposioExecResult> {
  const r = await fetch(`https://backend.composio.dev/api/v3/tools/execute/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...composioHeaders(key) },
    body: JSON.stringify({ arguments: args ?? {}, ...extra }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

/**
 * Execute a Composio tool with user-identity handling.
 *
 * Composio requires a user_id when it cannot resolve which connected account
 * to act as (multi-account toolkits). Strategy, in order:
 *   1. Call as-is (single-account setups keep working untouched).
 *   2. If Composio answers 400 demanding a user id AND we have an identity
 *      (explicit userId, else the caller's email), retry once with it.
 * The caller's identity is only ever sent to Composio — never to the model.
 */
export async function executeComposioTool(
  key: string,
  slug: string,
  args: unknown,
  opts: ComposioExecOpts = {}
): Promise<ComposioExecResult> {
  const base: Record<string, unknown> = {};
  if (opts.connectedAccountId) base.connected_account_id = opts.connectedAccountId;
  const first = await postExecute(key, slug, args, base);
  if (first.ok) return first;
  const identity =
    (typeof opts.userId === "string" && opts.userId.trim()) ||
    (typeof opts.email === "string" && opts.email.trim().toLowerCase()) ||
    "";
  if (first.status === 400 && identity) {
    const detail = composioErrorDetail(first.body, first.status);
    if (/user.?id/i.test(detail)) {
      return postExecute(key, slug, args, { ...base, user_id: identity });
    }
  }
  return first;
}
