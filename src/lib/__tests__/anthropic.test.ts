import { describe, it, expect } from "vitest";
import {
  accumulateAnthropicTurn,
  toAnthropicMessages,
  toAnthropicTools,
} from "@/lib/agent/anthropic";

describe("toAnthropicTools", () => {
  it("translates OpenAI-function shape to Messages shape", () => {
    const out = toAnthropicTools([
      { function: { name: "web_search", description: "Search", parameters: { type: "object", properties: { q: { type: "string" } } } } },
      { function: { name: "" } },
      {},
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "web_search", description: "Search" });
    expect((out[0].input_schema as { type: string }).type).toBe("object");
  });

  it("defaults missing schema and description", () => {
    const out = toAnthropicTools([{ function: { name: "x" } }]);
    expect(out[0].description).toBe("x");
    expect(out[0].input_schema).toEqual({ type: "object", properties: {} });
  });
});

describe("toAnthropicMessages", () => {
  it("drops system, maps text, tool_calls and tool results", () => {
    const msgs = toAnthropicMessages([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "looking",
        tool_calls: [{ id: "c1", function: { name: "web_search", arguments: '{"q":"x"}' } }],
      },
      { role: "tool", content: "found it", tool_call_id: "c1" },
    ]);
    expect(msgs[0]).toEqual({ role: "user", content: "hi" });
    const asst = msgs[1] as { role: string; content: unknown[] };
    expect(asst.role).toBe("assistant");
    expect(asst.content[0]).toEqual({ type: "text", text: "looking" });
    expect(asst.content[1]).toMatchObject({ type: "tool_use", id: "c1", name: "web_search" });
    expect(msgs[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "c1", content: "found it" }],
    });
  });

  it("merges consecutive same-role messages (API rejects repeats)", () => {
    const msgs = toAnthropicMessages([
      { role: "user", content: "first" },
      { role: "user", content: "That action needs confirmation." },
    ]);
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as { content: string }).content).toMatch(/first/);
    expect((msgs[0] as { content: string }).content).toMatch(/confirmation/);
  });

  it("skips unknown roles instead of misattributing", () => {
    expect(toAnthropicMessages([{ role: "system", content: "s" }])).toEqual([]);
    expect(toAnthropicMessages([{ role: "carrier-pigeon", content: "x" }])).toEqual([]);
  });
});

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
}

const F = (obj: unknown, event: string) => `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;

describe("accumulateAnthropicTurn", () => {
  it("streams text live and accumulates tool uses", async () => {
    const seen: string[] = [];
    const turn = await accumulateAnthropicTurn(
      sseStream([
        F({ type: "message_start" }, "message_start"),
        F({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }, "content_block_delta"),
        F({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } }, "content_block_delta"),
        F({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t1", name: "web_search" } }, "content_block_start"),
        F({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"q":' } }, "content_block_delta"),
        F({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"x"}' } }, "content_block_delta"),
        F({ type: "message_delta", delta: { stop_reason: "tool_use" } }, "message_delta"),
      ]).getReader(),
      undefined,
      (t) => seen.push(t)
    );
    expect(seen).toEqual(["Hel", "lo"]);
    expect(turn.text).toBe("Hello");
    expect(turn.toolUses).toHaveLength(1);
    expect(turn.toolUses[0]).toMatchObject({ id: "t1", name: "web_search", inputJson: '{"q":"x"}' });
    expect(turn.stopReason).toBe("tool_use");
  });

  it("tolerates split chunks and unknown frames", async () => {
    const enc = new TextEncoder();
    const wire = F({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "abc" } }, "content_block_delta");
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(wire.slice(0, 25)));
        c.enqueue(enc.encode(wire.slice(25)));
        c.enqueue(enc.encode('event: ping\ndata: {}\n\n'));
        c.enqueue(enc.encode('data: {not json}\n\n'));
        c.close();
      },
    });
    const seen: string[] = [];
    const turn = await accumulateAnthropicTurn(stream.getReader(), undefined, (t) => seen.push(t));
    expect(seen).toEqual(["abc"]);
    expect(turn.text).toBe("abc");
  });

  it("throws on upstream error events", async () => {
    await expect(
      accumulateAnthropicTurn(
        sseStream([F({ type: "error", error: { message: "overloaded" } }, "error")]).getReader(),
        undefined,
        () => undefined
      )
    ).rejects.toThrow(/overloaded/);
  });

  it("ends silently on abort with partial progress", async () => {
    const ctrl = new AbortController();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(F({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "part" } }, "content_block_delta")));
      },
    });
    setTimeout(() => ctrl.abort(), 10);
    const turn = await accumulateAnthropicTurn(stream.getReader(), ctrl.signal, () => undefined);
    expect(turn.text).toBe("part");
  });
});
