import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adapterFor } from "@/lib/ai/providers/adapters";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import { opencodeAdapter } from "@/lib/ai/providers/opencode";
import {
  __resetCatalogCache,
  OPENCODE_ORIGIN,
  enrichModel,
  fallbackCatalog,
  familyForModelId,
  freeFirst,
  getCatalog,
  isFreeModelId,
  modelNeedsKey,
  normalizeUpstreamError,
  parseCatalog,
} from "@/lib/ai/providers/opencode-catalog";
import {
  buildProjectContext,
  candidateFiles,
  detectDirs,
  isReadableConfig,
  isSafePath,
  parseConfigFile,
} from "@/lib/project-context";

/**
 * OpenCode provider tests. No test touches the live OpenCode service: the
 * in-process mock below speaks the documented wire shapes (OpenAI-style
 * /v1/models, OpenAI/Responses/Anthropic/Gemini SSE). The adapter and catalog
 * modules pin the https origin; tests route them into the mock, so every
 * byte the provider sends and receives is asserted in-process.
 */

const LIVE_MODELS = {
  object: "list",
  data: [
    { id: "mimo-v2.5-free" },
    { id: "muse-spark-1.3-contributor-free" },
    { id: "gpt-5.5" },
    { id: "claude-sonnet-4-6" },
    { id: "gemini-3-flash" },
    { id: "jev-1.13-free" },
    { id: "kimi-k2.6" },
  ],
};

const seenAuth: (string | null)[] = [];
const seenPaths: string[] = [];
let mode: "live" | "down" = "live";

function sse(lines: string[]): string {
  return lines.map((l) => `data: ${l}`).join("\n") + "\n\n";
}

const mockFetch = (async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  if (!u.startsWith(OPENCODE_ORIGIN)) throw new Error(`unexpected origin: ${u}`);
  const path = u.slice(OPENCODE_ORIGIN.length);
  seenPaths.push(path);
  const headers = new Headers(init?.headers);
  const auth = headers.get("authorization");
  if (path === "/inference/v1/models" && (!init || !init.method || init.method === "GET")) {
    if (mode === "down") return new Response("down", { status: 503 });
    return Response.json(LIVE_MODELS);
  }
  const j = JSON.parse(String(init?.body || "{}")) as { model?: string };
  if (j.model === "err-401") return new Response("bad key", { status: 401 });
  if (j.model === "err-429") return new Response("slow down", { status: 429 });
  if (path === "/inference/openai/v1/chat/completions") {
    seenAuth.push(auth);
    return new Response(
      sse(['{"choices":[{"delta":{"content":"Hel"}}]}', '{"choices":[{"delta":{"content":"lo"}}]}', "[DONE]"]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  }
  if (path === "/inference/openai/v1/responses") {
    seenAuth.push(auth);
    return new Response(sse(['{"type":"response.output_text.delta","delta":"R1"}', '{"type":"response.completed"}']), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }
  if (path === "/inference/anthropic/v1/messages") {
    seenAuth.push(auth);
    return new Response(sse(['{"type":"content_block_delta","delta":{"text":"C1"}}']), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }
  if (path.startsWith("/inference/google/v1beta/models/")) {
    seenAuth.push(auth);
    return new Response(sse(['{"candidates":[{"content":{"parts":[{"text":"G1"}]}}]}']), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }
  return new Response("nope", { status: 404 });
}) as typeof fetch;

async function collect(iter: AsyncIterable<{ type: string; text?: string }>) {
  const out: { type: string; text?: string }[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

// The adapter intentionally uses the global fetch (server-side, caller key in
// hand). Every suite below runs against the in-process mock by default; tests
// that need their own fetch behavior re-stub and restore around themselves.
let savedFetch: typeof fetch | undefined;
beforeEach(() => {
  savedFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  __resetCatalogCache();
});
afterEach(() => {
  if (savedFetch) globalThis.fetch = savedFetch;
  savedFetch = undefined;
});

describe("provider registration", () => {
  it("opencode is registered in metadata, adapter map, and capabilities", () => {
    expect(PROVIDERS.opencode.label).toBe("OpenCode");
    expect(PROVIDERS.opencode.defaultModel).toBe("mimo-v2.5-free");
    expect(adapterFor("opencode")).toBe(opencodeAdapter);
    expect(opencodeAdapter.id).toBe("opencode");
    expect(opencodeAdapter.capabilities({ provider: "opencode", model: "mimo-v2.5-free" }).toolCalling).toBe(true);
    expect(opencodeAdapter.capabilities({ provider: "opencode", model: "gpt-5.5" }).toolCalling).toBe(false);
    expect(opencodeAdapter.supportsToolCalling({ provider: "opencode", model: "kimi-k2.6" })).toBe(true);
  });
});

describe("model discovery", () => {
  it("discovers the live catalog through a mock server", async () => {
    const { models, source } = await getCatalog(mockFetch);
    expect(source).toBe("live");
    const ids = models.map((m) => m.id);
    expect(ids).toContain("mimo-v2.5-free");
    expect(ids).toContain("gpt-5.5");
    expect(models[0].free).toBe(true); // free-first ordering
  });

  it("falls back to the documented free set when discovery is down", async () => {
    mode = "down";
    try {
      const { models, source } = await getCatalog(mockFetch);
      expect(source).toBe("fallback");
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.free)).toBe(true);
    } finally {
      mode = "live";
    }
  });

  it("rejects malformed catalogs", () => {
    expect(() => parseCatalog({})).toThrow(/malformed/);
    expect(() => parseCatalog({ data: [{ nope: 1 }] })).toThrow(/empty/);
    expect(() => parseCatalog(null)).toThrow(/malformed/);
  });

  it("free detection: -free suffix plus documented ids", () => {
    expect(isFreeModelId("ling-3.0-tiny-free")).toBe(true);
    expect(isFreeModelId("big-pickle")).toBe(true);
    expect(isFreeModelId("kimi-k2.6")).toBe(false);
    expect(modelNeedsKey("kimi-k2.6")).toBe(true);
    expect(modelNeedsKey("space-bunny-free")).toBe(false);
  });

  it("fallback catalog never claims a paid model is free", () => {
    expect(fallbackCatalog().every((m) => m.free)).toBe(true);
  });

  it("free-first ordering is stable", () => {
    const ms = freeFirst([enrichModel("kimi-k2.6"), enrichModel("mimo-v2.5-free")]);
    expect(ms[0].id).toBe("mimo-v2.5-free");
  });
});

describe("API-family routing", () => {
  it("routes by documented prefixes", () => {
    expect(familyForModelId("mimo-v2.5-free")).toBe("openai-chat");
    expect(familyForModelId("kimi-k2.6")).toBe("openai-chat");
    expect(familyForModelId("gpt-5.5")).toBe("openai-responses");
    expect(familyForModelId("grok-4.5")).toBe("openai-responses");
    expect(familyForModelId("muse-spark-1.3-contributor-free")).toBe("openai-responses");
    expect(familyForModelId("claude-sonnet-4-6")).toBe("anthropic");
    expect(familyForModelId("qwen3.5-plus")).toBe("anthropic");
    expect(familyForModelId("gemini-3-flash")).toBe("gemini");
    expect(familyForModelId("jev-1.13-free")).toBe("unsupported");
    expect(familyForModelId("")).toBe("unsupported");
  });

  it("refuses unsupported families before any request", async () => {
    const realFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("", { status: 500 });
    }) as typeof fetch;
    try {
      await expect(
        opencodeAdapter.complete({ apiKey: "", baseURL: "x", model: "jev-1.13-free", messages: [] })
      ).rejects.toThrow(/no documented streaming API/);
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("streaming through a mocked OpenCode server", () => {
  it("streams chat deltas with NO auth header for free keyless calls", async () => {
    seenAuth.length = 0;
    const events = await collect(
      await opencodeAdapter.complete({
        apiKey: "",
        baseURL: "https://evil.example/v1",
        model: "mimo-v2.5-free",
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
      })
    );
    // Client baseURL is ignored (endpoints are pinned); free calls send no key.
    expect(seenAuth).toEqual([null]);
    expect(events.filter((e) => e.type === "delta").map((e) => e.text)).toEqual(["Hel", "lo"]);
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("streams responses/anthropic/gemini families", async () => {
    const r = await collect(
      await opencodeAdapter.complete({ apiKey: "oc_k", baseURL: "x", model: "gpt-5.5", messages: [] })
    );
    expect(r.map((e) => (e as { text?: string }).text ?? e.type)).toContain("R1");
    const a = await collect(
      await opencodeAdapter.complete({ apiKey: "oc_k", baseURL: "x", model: "claude-sonnet-4-6", messages: [] })
    );
    expect(a.map((e) => (e as { text?: string }).text ?? e.type)).toContain("C1");
    const g = await collect(
      await opencodeAdapter.complete({ apiKey: "oc_k", baseURL: "x", model: "gemini-3-flash", messages: [] })
    );
    expect(g.map((e) => (e as { text?: string }).text ?? e.type)).toContain("G1");
  });

  it("sends the caller's Bearer key for paid models", async () => {
    seenAuth.length = 0;
    await collect(await opencodeAdapter.complete({ apiKey: "oc_secret", baseURL: "x", model: "kimi-k2.6", messages: [] }));
    expect(seenAuth.at(-1)).toBe("Bearer oc_secret");
  });

  it("cancellation aborts mid-stream and ends silently", async () => {
    const ctrl = new AbortController();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));
          setTimeout(() => ctrl.abort(), 10);
          setTimeout(() => {
            try {
              c.close();
            } catch {
              /* aborted */
            }
          }, 500);
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    try {
      const events = await collect(
        await opencodeAdapter.complete({
          apiKey: "",
          baseURL: "x",
          model: "mimo-v2.5-free",
          messages: [],
          signal: ctrl.signal,
        })
      );
      expect(events.every((e) => e.type === "delta")).toBe(true);
      expect(events.some((e) => e.type === "done")).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("authentication behavior", () => {
  it("paid model without key fails closed WITHOUT fetching", async () => {
    const realFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("", { status: 500 });
    }) as typeof fetch;
    try {
      // The fail-closed check runs before any network access by construction.
      await expect(
        opencodeAdapter.complete({ apiKey: "   ", baseURL: "x", model: "kimi-k2.6", messages: [] })
      ).rejects.toThrow(/requires authentication/);
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("maps 401/429/503 to user-safe errors", async () => {
    await expect(
      opencodeAdapter.complete({ apiKey: "oc_k", baseURL: "x", model: "err-401", messages: [] })
    ).rejects.toThrow(/rejected the key/);
    expect(normalizeUpstreamError(429, "").message).toMatch(/rate limit/);
    expect(normalizeUpstreamError(503, "").message).toMatch(/temporarily unavailable/);
    expect(normalizeUpstreamError(404, "").message).toMatch(/no such model/);
    expect(normalizeUpstreamError(403, "").message).toMatch(/refused/);
    const n = normalizeUpstreamError(500, "x".repeat(500));
    expect(n.message.length).toBeLessThan(400);
    expect(n.retryable).toBe(true);
  });
});

describe(".opencode/ project context", () => {
  const listing = [
    { path: ".opencode", type: "dir" },
    { path: ".opencode/opencode.json", type: "file", size: 100 },
    { path: ".opencode/auth.json", type: "file", size: 100 },
    { path: ".opencode/AGENTS.md", type: "file", size: 50 },
    { path: ".claude/x", type: "file", size: 10 },
    { path: "src/a.ts", type: "file", size: 10 },
  ];

  it("detects supported dirs, never credential files", () => {
    expect(detectDirs(listing)).toEqual([".opencode", ".claude"]);
    expect(isReadableConfig(".opencode/auth.json")).toBe(false);
    expect(isReadableConfig(".opencode/credentials.json")).toBe(false);
    expect(isReadableConfig(".opencode/id_rsa")).toBe(false);
    expect(isReadableConfig(".opencode/token.json")).toBe(false);
    expect(isReadableConfig(".opencode/.env")).toBe(false);
    expect(isReadableConfig(".opencode/opencode.json")).toBe(true);
    expect(isReadableConfig(".opencode/AGENTS.md")).toBe(true);
  });

  it("rejects traversal and caps candidates", () => {
    expect(isSafePath(".opencode/../../x")).toBe(false);
    expect(isSafePath("/etc/passwd")).toBe(false);
    expect(candidateFiles(listing, ".opencode").map((c) => c.path)).toEqual([
      ".opencode/opencode.json",
      ".opencode/AGENTS.md",
    ]);
  });

  it("parses json/jsonc and excerpts text within caps", () => {
    expect(parseConfigFile(".opencode", ".opencode/opencode.json", '{"model":"x"}').content).toEqual({ model: "x" });
    expect(parseConfigFile(".opencode", ".opencode/opencode.jsonc", '{\n// c\n"a":1\n}').content).toEqual({ a: 1 });
    const big = parseConfigFile(".opencode", "n.md", "z".repeat(60 * 1024));
    expect(big.truncated).toBe(true);
    expect(String(big.content).length).toBeLessThanOrEqual(50 * 1024);
  });

  it("builds context stating config is not access", () => {
    const ctx = buildProjectContext([parseConfigFile(".opencode", ".opencode/opencode.json", '{"a":1}')], []);
    expect(ctx.detected).toEqual([".opencode"]);
    expect(ctx.markdown).toMatch(/never implies model access or credentials/);
  });
});
