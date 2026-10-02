/**
 * Provider abstraction — the seam between MAXXEN and whatever model backs it.
 *
 * The model is replaceable; MAXXEN is not. Routes talk to a `ProviderAdapter`
 * instead of a concrete SDK, and ask for a `CapabilityDescriptor` before
 * offering a feature (e.g. the agent loop registers tools only when the model
 * reports `toolCalling`). Nothing here is OpenAI- or Anthropic-specific.
 *
 * Provider METADATA (id, label, default endpoint, models) lives in
 * ./providers/registry so it can be imported by client code too; ADAPTERS
 * (which pull in the SDKs) live in ./providers/* and are server-only.
 */
import type { ChatMsg } from "@/lib/context";

/** Canonical provider ids. Single source of truth for the whole app. */
export const PROVIDER_IDS = ["openai", "anthropic", "gemini", "custom", "opencode"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** A concrete provider + model a request should run against. */
export interface ModelRef {
  provider: ProviderId;
  model: string;
}

/**
 * What a model can do. Fields we can verify from the current implementation are
 * set from observed behaviour; unverifiable numeric limits are `null` (honest
 * "unknown") rather than guessed. Per-model verification is a later phase.
 */
export interface CapabilityDescriptor {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  parallelToolCalls: boolean;
  /** null = not verified for this model. */
  maxContextTokens: number | null;
  /** null = not verified for this model. */
  maxOutputTokens: number | null;
  supportsSystemPrompt: boolean;
}

/** A single streaming completion request (BYOK: the caller's key/baseURL). */
export interface ModelRequest {
  apiKey: string;
  baseURL: string;
  model: string;
  system?: string;
  messages: ChatMsg[];
  /** Vision payloads (served only by vision-capable adapters). */
  images?: { name: string; dataUrl: string }[];
  temperature?: number;
  mode?: string;
  signal?: AbortSignal;
}

/**
 * Provider-level streaming events. These are the raw building blocks that the
 * transport layer maps onto canonical MaxxenEvents (see lib/streaming).
 */
export type ModelEvent =
  | { type: "delta"; text: string }
  | { type: "error"; message: string; status?: number }
  | { type: "done" };

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  readonly defaultBaseURL: string;
  /** Capability descriptor for a given model. */
  capabilities(model: ModelRef): CapabilityDescriptor;
  /** Whether this provider/model can drive the tool-calling agent loop. */
  supportsToolCalling(model: ModelRef): boolean;
  /**
   * Establish a streaming completion. Resolves once upstream accepts the call
   * (so immediate auth/model errors surface BEFORE any streaming begins);
   * throws `ProviderError` on immediate failure.
   */
  complete(request: ModelRequest): Promise<AsyncIterable<ModelEvent>>;
}

/** Credential-free provider error (message is safe to show a user). */
export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
