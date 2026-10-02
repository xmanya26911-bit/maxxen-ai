/**
 * Shared request preamble for /api/chat and /api/agent/run (Phase 2: one runtime).
 *
 * Both routes previously resolved provider → URL → model with independent,
 * slowly-diverging copies. This module is the single implementation. Routes
 * keep only their own policy (key rules, Anthropic handling, family gates)
 * and their exact error precedence (call sites are unchanged).
 *
 * Isomorphic-safe: net-guard, opencode-catalog and registry are all
 * dependency-free and client-safe.
 */
import { assertSafeBaseURL } from "@/lib/net-guard";
import { OPENCODE_CHAT_URL } from "./providers/opencode-catalog";
import { resolveProvider } from "./providers/registry";
import type { ProviderId } from "./types";

export const DEFAULT_MODEL = "gpt-4o-mini";
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export interface ResolvedEndpoint {
  providerId: ProviderId;
  /** Pinned for OpenCode, asserted custom/OpenAI default otherwise. */
  url: string;
  /** Requested model id, or DEFAULT_MODEL when absent/blank. */
  model: string;
}

/**
 * Resolve provider + endpoint URL + model. Throws Error on an unsafe base
 * URL (routes map it to their existing 400 contract). Never throws for a
 * missing key or model — key policy stays route-specific, model falls back
 * to the shared default (strictly safer than the old per-route casts, which
 * crashed on non-string models instead of defaulting).
 */
export function resolveEndpoint(body: {
  provider?: unknown;
  baseURL?: unknown;
  model?: unknown;
}): ResolvedEndpoint {
  const providerId = resolveProvider(body.provider, "custom");
  let url: string;
  if (providerId === "opencode") {
    // Pinned server-side: a crafted client baseURL can never redirect OpenCode calls.
    url = OPENCODE_CHAT_URL;
  } else {
    try {
      url = assertSafeBaseURL(body.baseURL, DEFAULT_BASE_URL);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Bad base URL.");
    }
  }
  const model = (typeof body.model === "string" ? body.model : "").trim() || DEFAULT_MODEL;
  return { providerId, url, model };
}
