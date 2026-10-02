import type { CapabilityDescriptor } from "./types";

/**
 * Honest capability descriptors.
 *
 * We set what the current implementation actually verifiably supports, and mark
 * everything we cannot verify as unsupported / `null` rather than inventing
 * values. This is intentional: the runtime must never claim a capability it
 * cannot honour. Per-model refinement belongs to the provider phase.
 */
function base(): CapabilityDescriptor {
  return {
    streaming: true, // verified: every provider streams today
    toolCalling: false,
    vision: false,
    structuredOutput: false,
    reasoning: false,
    parallelToolCalls: false,
    maxContextTokens: null,
    maxOutputTokens: null,
    supportsSystemPrompt: true,
  };
}

/**
 * OpenAI-compatible endpoints: OpenAI, Gemini's OpenAI shim, and any custom
 * base URL (Groq, Ollama, OpenRouter, …).
 *
 * `toolCalling: true` reflects that MAXXEN's agent loop drives function-calling
 * against OpenAI-compatible endpoints today. It is a property of the endpoint
 * FAMILY (the loop is implemented and verified against it), not a per-model
 * guarantee — per-model verification is deferred.
 */
export function openAICompatibleCapabilities(): CapabilityDescriptor {
  return { ...base(), toolCalling: true };
}

/**
 * Claude's Messages API. The agent loop drives native Anthropic
 * tool_use blocks (lib/agent/anthropic), so `toolCalling` is honestly true.
 * Chat streaming is unchanged.
 */
export function anthropicCapabilities(): CapabilityDescriptor {
  return { ...base(), toolCalling: true };
}
