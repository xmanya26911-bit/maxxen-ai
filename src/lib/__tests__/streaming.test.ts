import { describe, it, expect } from "vitest";
import { encodeEvent } from "@/lib/streaming/encode";
import { createEventParser, parseFrame } from "@/lib/streaming/parse";
import { isMaxxenEvent, isMaxxenEventType } from "@/lib/streaming/events";
import type { MaxxenEvent } from "@/lib/streaming/types";

describe("canonical streaming protocol", () => {
  it("round-trips a single event", () => {
    const ev: MaxxenEvent = { type: "message.delta", text: "hello" };
    const p = createEventParser();
    expect([...p.push(encodeEvent(ev)), ...p.flush()]).toEqual([ev]);
  });

  it("round-trips many events delivered in one chunk", () => {
    const events: MaxxenEvent[] = [
      { type: "run.start", mode: "chat", model: "gpt-4o-mini" },
      { type: "message.delta", text: "a" },
      { type: "tool.start", callId: "c1", tool: "project_list" },
      { type: "tool.result", callId: "c1", tool: "project_list", ok: true, data: { n: 1 } },
      { type: "permission.request", tool: "vercel_deploy", summary: "deploy?" },
      { type: "agent.activity", phase: "planning", text: "Planning", tool: "x" },
      { type: "run.complete", mode: "chat" },
    ];
    const wire = events.map(encodeEvent).join("");
    const p = createEventParser();
    expect([...p.push(wire), ...p.flush()]).toEqual(events);
  });

  it("reassembles an event split across many string chunks", () => {
    const ev: MaxxenEvent = { type: "agent.activity", phase: "tool", text: "Working…", tool: "x" };
    const wire = encodeEvent(ev);
    const p = createEventParser();
    const out: MaxxenEvent[] = [];
    for (let i = 0; i < wire.length; i += 3) out.push(...p.push(wire.slice(i, i + 3)));
    out.push(...p.flush());
    expect(out).toEqual([ev]);
  });

  it("handles multi-byte UTF-8 split across single-byte chunks", () => {
    const ev: MaxxenEvent = { type: "message.delta", text: "emoji ✶ and dash — done" };
    const bytes = new TextEncoder().encode(encodeEvent(ev));
    const p = createEventParser();
    const out: MaxxenEvent[] = [];
    for (let i = 0; i < bytes.length; i++) out.push(...p.push(bytes.subarray(i, i + 1)));
    out.push(...p.flush());
    expect(out).toEqual([ev]);
  });

  it("drops malformed frames without throwing", () => {
    const p = createEventParser();
    const out = [
      ...p.push("event: x\ndata: {not json}\n\n"),
      ...p.push('data: {"type":"nope"}\n\n'),
      ...p.push(encodeEvent({ type: "run.complete" })),
      ...p.flush(),
    ];
    expect(out).toEqual([{ type: "run.complete" }]);
  });

  it("parseFrame validates the event shape", () => {
    expect(parseFrame('data: {"type":"message.delta","text":"x"}')).toEqual({ type: "message.delta", text: "x" });
    expect(parseFrame('data: {"type":"message.delta"}')).toBeNull(); // missing text
    expect(parseFrame("nonsense")).toBeNull();
    expect(parseFrame("")).toBeNull();
  });

  it("isMaxxenEvent guards unknown/malformed values", () => {
    expect(isMaxxenEvent({ type: "message.delta", text: "x" })).toBe(true);
    expect(isMaxxenEvent({ type: "nope" })).toBe(false);
    expect(isMaxxenEvent({ type: "tool.result", callId: "c", tool: "t" })).toBe(false); // missing ok
    expect(isMaxxenEvent(null)).toBe(false);
    expect(isMaxxenEventType("run.complete")).toBe(true);
    expect(isMaxxenEventType("bogus")).toBe(false);
  });
});
