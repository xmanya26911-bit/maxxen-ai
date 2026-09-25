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
