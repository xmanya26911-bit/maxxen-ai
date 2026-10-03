import { anthropicCapabilities, nonToolCallingCapabilities, openAICompatibleCapabilities } from "../capabilities";
import { familyForModelId } from "./opencode-catalog";
import { PROVIDER_IDS, type CapabilityDescriptor, type ProviderId } from "../types";

// Re-export the canonical provider ids/type so consumers have ONE provider
// import path (endpoint.ts and Settings both depend on this).
export { PROVIDER_IDS } from "../types";
export type { ProviderId } from "../types";


/**
 * Canonical provider registry — ONE source of truth for provider/model
 * metadata. Pure data (no SDK imports), so client code can safely import it
 * (e.g. Settings) without pulling a provider SDK into the browser bundle.
 *
 * Adapters (which do import SDKs) live in ./openai, ./anthropic and are wired
 * up by ./adapters for the server routes.
 */

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProviderInfo {
  id: ProviderId;
  /** Bare name, e.g. "ChatGPT". */
  label: string;
  /** Monochrome glyph used across the product. */
  glyph: string;
  /** Default endpoint for this provider ("" = must be supplied). */
  defaultBaseURL: string;
  /** Placeholder hint for the Settings key field. */
  keyHint: string;
  /** Default model id when the user hasn't chosen one. */
  defaultModel: string;
  /** Known/suggested models (not exhaustive). */
  models: ModelInfo[];
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "ChatGPT",
    glyph: "◈",
    defaultBaseURL: "https://api.openai.com/v1",
    keyHint: "sk-… from platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    glyph: "✶",
    defaultBaseURL: "https://api.anthropic.com",
    keyHint: "sk-ant-… from console.anthropic.com",
    defaultModel: "claude-3-5-haiku-latest",
    models: [
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    glyph: "⬢",
    defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyHint: "AIza… from aistudio.google.com",
    defaultModel: "gemini-1.5-flash",
    models: [{ id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" }],
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    glyph: "⬡",
    defaultBaseURL: "https://opencode.ai/inference/openai/v1",
    keyHint: "optional — free models need no key",
    defaultModel: "mimo-v2.5-free",
    models: [],
  },
  custom: {
    id: "custom",
    label: "Custom",
    glyph: "",
    defaultBaseURL: "",
    keyHint: "as issued by your provider",
    defaultModel: "",
    models: [],
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Coerce arbitrary input to a known provider (falls back to `fallback`). */
export function resolveProvider(raw: unknown, fallback: ProviderId = "custom"): ProviderId {
  return isProviderId(raw) ? raw : fallback;
}

export function getProvider(id: ProviderId): ProviderInfo {
  return PROVIDERS[id];
}

export function defaultModel(id: ProviderId): string {
  return PROVIDERS[id].defaultModel;
}

/** Display label including glyph, e.g. "◈ ChatGPT" ("" glyph for custom). */
export function displayLabel(id: ProviderId): string {
  const p = PROVIDERS[id];
  return p.glyph ? `${p.glyph} ${p.label}` : p.label;
}

/** Capability descriptor for a provider/model. */
export function capabilitiesFor(id: ProviderId, model: string): CapabilityDescriptor {
  if (id === "anthropic") return anthropicCapabilities();
  // OpenCode: only the OpenAI-chat family drives the tool loop; every other
  // family is streaming chat (honestly non-tool-calling, like Claude).
  if (id === "opencode")
    return familyForModelId(model) === "openai-chat" ? openAICompatibleCapabilities() : nonToolCallingCapabilities();
  return openAICompatibleCapabilities();
}

export function supportsToolCalling(id: ProviderId, model: string): boolean {
  return capabilitiesFor(id, model).toolCalling;
}
