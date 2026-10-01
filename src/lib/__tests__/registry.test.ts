import { describe, it, expect } from "vitest";
import { PROVIDER_META, PROVIDER_IDS } from "@/lib/endpoint";
import {
  PROVIDERS,
  capabilitiesFor,
  displayLabel,
  isProviderId,
  resolveProvider,
  supportsToolCalling,
} from "@/lib/ai/providers/registry";

describe("provider registry is the single source of truth", () => {
  it("endpoint metadata is derived from the registry (no drift)", () => {
    expect(PROVIDER_META.openai.label).toBe(displayLabel("openai"));
    expect(PROVIDER_META.openai.label).toBe("◈ ChatGPT");
    expect(PROVIDER_META.anthropic.label).toBe("✶ Claude");
    expect(PROVIDER_META.custom.label).toBe("Custom");
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_META[id].baseURL).toBe(PROVIDERS[id].defaultBaseURL);
      expect(PROVIDER_META[id].model).toBe(PROVIDERS[id].defaultModel);
      expect(PROVIDER_META[id].keyHint).toBe(PROVIDERS[id].keyHint);
    }
  });

  it("keeps the canonical Claude model id (drift fix)", () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe("claude-3-5-haiku-latest");
  });

  it("honest capabilities: OpenAI-compatible supports tools, Claude does not", () => {
    expect(capabilitiesFor("openai", "gpt-4o-mini").toolCalling).toBe(true);
    expect(capabilitiesFor("custom", "any").toolCalling).toBe(true);
    expect(capabilitiesFor("anthropic", "claude-3-5-haiku-latest").toolCalling).toBe(false);
    expect(supportsToolCalling("anthropic", "claude-3-5-haiku-latest")).toBe(false);
    // Unverifiable numeric limits are represented as null, not guessed.
    expect(capabilitiesFor("openai", "gpt-4o-mini").maxContextTokens).toBeNull();
    // Streaming is verified for every provider.
    expect(capabilitiesFor("anthropic", "x").streaming).toBe(true);
  });

  it("resolves unknown providers to a safe fallback", () => {
    expect(isProviderId("openai")).toBe(true);
    expect(isProviderId("nope")).toBe(false);
    expect(resolveProvider("gemini")).toBe("gemini");
    expect(resolveProvider("bogus")).toBe("custom");
    expect(resolveProvider(undefined)).toBe("custom");
  });
});
