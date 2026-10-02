import { describe, it, expect } from "vitest";
import { assembleSystemPrompt, requireCapabilities, resolveEndpoint, resolvePolicy, DEFAULT_MODEL, DEFAULT_BASE_URL } from "@/lib/ai/request";
import { OPENCODE_CHAT_URL } from "@/lib/ai/providers/opencode-catalog";

describe("resolveEndpoint (shared chat/agent preamble)", () => {
  it("pins the OpenCode endpoint and ignores client baseURL", () => {
    const r = resolveEndpoint({ provider: "opencode", baseURL: "https://evil.test/v1", model: "mimo-v2.5-free" });
    expect(r.providerId).toBe("opencode");
    expect(r.url).toBe(OPENCODE_CHAT_URL);
    expect(r.model).toBe("mimo-v2.5-free");
  });

  it("defaults provider, URL, and model", () => {
    const r = resolveEndpoint({});
    expect(r.providerId).toBe("custom");
    expect(r.url).toBe(DEFAULT_BASE_URL);
    expect(r.model).toBe(DEFAULT_MODEL);
  });

  it("keeps a valid custom baseURL and model", () => {
    const r = resolveEndpoint({ provider: "custom", baseURL: "https://groq.test/openai/v1", model: "llama-x" });
    expect(r.url).toBe("https://groq.test/openai/v1");
    expect(r.model).toBe("llama-x");
  });

  it("throws a safe message on unsafe base URLs", () => {
    expect(() => resolveEndpoint({ baseURL: "http://plain.test/v1" })).toThrow(/https/);
    expect(() => resolveEndpoint({ baseURL: "https://localhost:9/v1" })).toThrow(/not allowed/);
  });

  it("preserves the anthropic id (route sniffing unchanged)", () => {
    expect(resolveEndpoint({ provider: "anthropic" }).providerId).toBe("anthropic");
  });

  it("defaults non-string models instead of crashing", () => {
    expect(resolveEndpoint({ model: 123 as unknown as string }).model).toBe(DEFAULT_MODEL);
  });

  it("assembles system blocks in order, dropping empties", () => {
    expect(assembleSystemPrompt(["a", "", null, "b"])).toBe("a\\n\\nb");
    expect(assembleSystemPrompt(["  spaced  "])).toBe("spaced");
    expect(assembleSystemPrompt([false, undefined])).toBe("");
  });

  it("resolves bounded run policies with historical defaults", () => {
    expect(resolvePolicy({})).toEqual({ maxSteps: 6, maxToolCalls: 24, timeoutMs: 120000 });
    expect(resolvePolicy({ maxSteps: 99 }).maxSteps).toBe(10);
    expect(resolvePolicy({ maxSteps: 0 }).maxSteps).toBe(6);
    expect(resolvePolicy({ maxTools: 3 }).maxToolCalls).toBe(3);
  });

  it("gates capabilities without silent downgrade", () => {
    expect(requireCapabilities("openai", "gpt-4o-mini", { toolCalling: true })).toBeNull();
    expect(requireCapabilities("anthropic", "claude-3-5-haiku-latest", { toolCalling: true })).toBeNull();
    expect(requireCapabilities("opencode", "gpt-5.5", { toolCalling: true })).toMatch(/cannot drive the agent loop/);
    expect(requireCapabilities("bogus", "x", {})).toBeNull();
  });
});
