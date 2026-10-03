import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Golden test for the existing agent loop, driven through the real route with a
 * fake model adapter (mocked `openai`) and a fake protected tool. It verifies
 * the tool loop, the canonical event stream, that only a user "Confirmed:"
 * message authorizes a protected tool, and that credentials never reach
 * model-bound data.
 */

const h = vi.hoisted(() => ({
  calls: [] as unknown[],
  script: [] as unknown[],
  args: null as Record<string, unknown> | null,
  ctx: null as { confirmedTool?: string } | null,
  runtime: null as unknown,
  session: "" as string,
}));

// Fake OpenAI-compatible client: `create()` returns scripted STREAMING responses
// (async-iterable delta chunks, like the real SDK with `stream: true`). The agent
// loop consumes the stream with `for await`, so a plain non-streaming object
// would throw "not async iterable" and surface as an `error` event instead of
// the scripted tool loop.
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (args: unknown) => {
          h.calls.push(args);
          const next = h.script.shift() as
            | { choices: { message: { content?: string; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] } }[] }
            | undefined;
          const msg = next?.choices?.[0]?.message ?? { content: "done" };
          // Some gateways ignore `stream: true` and return a plain completion
          // object; normalize it into streamed chunks so the assertions below
          // hold for both shapes.
          const textOf = (m: { content?: unknown }) => (typeof m.content === "string" ? m.content : "");
          async function* gen() {
            if (msg.tool_calls?.length) {
              if (textOf(msg)) yield { choices: [{ delta: { content: textOf(msg) } }] };
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: msg.tool_calls.map((tc, i) => ({
                        index: i,
                        id: tc.id,
                        type: tc.type,
                        function: { name: tc.function.name, arguments: tc.function.arguments },
                      })),
                    },
                  },
                ],
              };
            } else {
              const text = textOf(msg);
              const mid = Math.ceil(text.length / 2);
              if (text.slice(0, mid)) yield { choices: [{ delta: { content: text.slice(0, mid) } }] };
              if (text.slice(mid)) yield { choices: [{ delta: { content: text.slice(mid) } }] };
              if (!text) yield { choices: [{ delta: {} }] };
            }
          }
          const stream = gen();
          // Attach a non-streaming twin so routes that tolerate BOTH shapes
          // keep working (and a regression back to non-stream coupling fails
          // loudly here instead of deadlocking).
          (stream as unknown as { choices: unknown }).choices = [{ message: msg }];
          return stream;
        },
      },
    };
  },
}));

// Fake runtime exposing one protected tool.
vi.mock("@/lib/maxxen-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/maxxen-runtime")>();
  return { ...actual, buildRuntime: vi.fn(async () => h.runtime) };
});

import { POST } from "@/app/api/agent/run/route";
import { createEventParser } from "@/lib/streaming/parse";
import type { MaxxenEvent } from "@/lib/streaming/types";
import { signSession } from "@/lib/session";

const FAKE_KEY = "sk-test-FAKE-credential-1234567890";

const toolCallStep = () => ({
  choices: [
    {
      message: {
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "deploy_thing", arguments: JSON.stringify({ project: "p", confirm: true }) },
          },
        ],
      },
    },
  ],
});
const finalStep = (text: string) => ({ choices: [{ message: { content: text } }] });

async function runAgent(messages: { role: string; content: string }[]): Promise<MaxxenEvent[]> {
  const req = new Request("http://localhost/api/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-maxxen-session": h.session },
    body: JSON.stringify({ messages, apiKey: FAKE_KEY, baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" }),
  });
  const res = await POST(req);
  // A JSON rejection (e.g. a session/auth or validation error) carries no
  // event stream — surface it plainly so the assertion diff stays readable.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const body = await res.text();
    throw new Error(`agent route rejected the run (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  const parser = createEventParser();
  return [...parser.push(text), ...parser.flush()];
}

beforeEach(() => {
  process.env.OTP_SECRET = "test-secret-maxxen";
  h.session = signSession("test@maxxen.ai");
  h.calls.length = 0;
  h.script.length = 0;
  h.args = null;
  h.ctx = null;
  h.runtime = {
    capabilities: {
      ai: { configured: true },
      github: { configured: false, read: false, write: false, createRepository: false },
      vercel: { configured: false, deploy: false, inspect: false },
      composio: { configured: false, reachable: false, toolCount: 0 },
    },
    tools: [
      {
        id: "deploy_thing",
        kind: "deploy",
        permission: "deploy",
        description: "Deploy the thing (protected).",
        parameters: { project: "string" },
        run: async (args: Record<string, unknown>, ctx: { confirmedTool?: string }) => {
          h.args = args;
          h.ctx = ctx;
          if (ctx.confirmedTool !== "deploy_thing") return { ok: false, summary: "Needs explicit user confirmation.", needsConfirm: true };
          return { ok: true, summary: "Deployed.", data: { url: "example.vercel.app" } };
        },
      },
    ],
    systemPrompt: "SYSTEM: you are Maxxen.",
  };
});

describe("agent loop (golden path + authorization)", () => {
  it("emits canonical events and completes deterministically", async () => {
    h.script = [finalStep("Hello world")];
    const events = await runAgent([{ role: "user", content: "hi" }]);
    expect(events[0]).toEqual({ type: "run.start", mode: "agent", model: "gpt-4o-mini" });
    const text = events
      .filter((e) => e.type === "message.delta")
      .map((e) => (e as { text: string }).text)
      .join("");
    expect(text).toBe("Hello world");
    expect(events[events.length - 1]).toEqual({ type: "run.complete", mode: "agent" });
  });

  it("runs the tool loop: model -> tool call -> tool result -> final response", async () => {
    h.script = [toolCallStep(), finalStep("All done.")];
    const events = await runAgent([{ role: "user", content: "Confirmed: deploy_thing\ndeploy it" }]);
    const types = events.map((e) => e.type);
    expect(types).toContain("tool.start");
    expect(types).toContain("tool.delta");
    expect(types).toContain("tool.result");
    expect(types).toContain("run.complete");
    const tr = events.find((e) => e.type === "tool.result") as { tool: string; ok: boolean; data: unknown };
    expect(tr).toMatchObject({ tool: "deploy_thing", ok: true });
    expect(tr.data).toEqual({ url: "example.vercel.app" });
  });

  it("model-supplied confirm cannot authorize a protected action", async () => {
    h.script = [toolCallStep(), finalStep("Blocked.")];
    const events = await runAgent([{ role: "user", content: "please deploy" }]);
    expect(h.ctx?.confirmedTool).toBeUndefined();
    // model-supplied `confirm` was stripped before the tool saw its args
    expect(h.args).toEqual({ project: "p" });
    const tr = events.find((e) => e.type === "tool.result") as { ok: boolean };
    expect(tr.ok).toBe(false);
    expect(events.some((e) => e.type === "permission.request")).toBe(true);
  });

  it("an explicit user 'Confirmed:' message is the only authorization source", async () => {
    h.script = [toolCallStep(), finalStep("Done.")];
    await runAgent([{ role: "user", content: "Confirmed: deploy_thing\ndeploy it" }]);
    expect(h.ctx?.confirmedTool).toBe("deploy_thing");
    expect(h.args).toEqual({ project: "p" }); // still stripped from model args
  });

  it("never leaks the API credential into model-bound data or emitted events", async () => {
    h.script = [toolCallStep(), finalStep("Done.")];
    const events = await runAgent([{ role: "user", content: "Confirmed: deploy_thing\ndeploy" }]);
    const runtime = h.runtime as {
      systemPrompt: string;
      tools: { id: string; description: string; parameters: unknown }[];
    };
    const modelBound = JSON.stringify({
      createCalls: h.calls,
      systemPrompt: runtime.systemPrompt,
      tools: runtime.tools.map((t) => ({ id: t.id, description: t.description, parameters: t.parameters })),
    });
    expect(modelBound).not.toContain(FAKE_KEY);
    expect(JSON.stringify(events)).not.toContain(FAKE_KEY);
  });
});
