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
import { capabilitiesFor, resolveProvider } from "./providers/registry";
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

/**
 * Shared system assembly (Phase 2.2): ordered, empty-dropping join. Both
 * routes pass identical block order (identity → memory → project →
 * user-memory → time/location); priority work lands here later.
 */
export function assembleSystemPrompt(blocks: (string | null | undefined | false)[]): string {
  return blocks
    .map((b) => (typeof b === "string" ? b.trim() : ""))
    .filter((b) => b.length > 0)
    .join("\n\n");
}

/** Agent run policy: bounded steps, tool calls, and wall-clock time. */
export interface RunPolicy {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
}

export const DEFAULT_POLICY: RunPolicy = { maxSteps: 6, maxToolCalls: 24, timeoutMs: 120_000 };

function clampInt(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Resolve policy with the historical defaults (6 steps, max 10) preserved. */
export function resolvePolicy(body: {
  maxSteps?: unknown;
  maxTools?: unknown;
  maxRuntimeMs?: unknown;
}): RunPolicy {
  return {
    maxSteps: clampInt(body.maxSteps, DEFAULT_POLICY.maxSteps, 1, 10),
    maxToolCalls: clampInt(body.maxTools, DEFAULT_POLICY.maxToolCalls, 1, 60),
    timeoutMs: clampInt(body.maxRuntimeMs, DEFAULT_POLICY.timeoutMs, 30_000, 300_000),
  };
}

/**
 * ModelRouter gate: does this model honestly support what the caller needs?
 * Returns a user-safe error or null. Never silently downgrades.
 */
export function requireCapabilities(
  rawProvider: unknown,
  model: string,
  need: { toolCalling?: boolean; streaming?: boolean }
): string | null {
  const { providerId } = resolveEndpoint({ provider: rawProvider, model });
  const caps = capabilitiesFor(providerId, model);
  const name = model.trim() || "that model";
  if (need.toolCalling && !caps.toolCalling)
    return `"${name}" cannot drive the agent loop — pick a tool-capable model (OpenAI, Gemini, Custom OpenAI-compatible, or Claude).`;
  if (need.streaming && !caps.streaming) return `"${name}" does not stream — pick a streaming model.`;
  return null;
}
