import type { ProviderAdapter, ProviderId } from "../types";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";

/**
 * Provider id -> adapter. Server-only (imports the SDK-bearing adapters), so it
 * must never be imported by client components. Metadata-only concerns live in
 * ./registry, which IS client-safe.
 *
 * `gemini` and `custom` are OpenAI-compatible and therefore share the OpenAI
 * adapter; identity/endpoint/model come from the registry, not the adapter.
 */
const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: openaiAdapter,
  custom: openaiAdapter,
};

export function adapterFor(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id];
}
