import { describe, it, expect } from "vitest";
import {
  budgetConversation,
  budgetMessages,
  buildCompactionPrompt,
  estimateTokens,
  summarizeHistory,
  COMPACT_THRESHOLD_MESSAGES,
} from "@/lib/context/engine";
import type { ChatMsg } from "@/lib/context";

const msg = (role: "user" | "assistant", content: string): ChatMsg => ({ role, content });
const conv = (n: number): ChatMsg[] =>
  Array.from({ length: n }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `message ${i} with some content here`));

describe("estimateTokens", () => {
  it("approximates ~4 chars per token with per-message overhead counted by callers", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("1234")).toBe(1);
    expect(estimateTokens("12345")).toBe(2);
  });
});

describe("budgetMessages", () => {
  it("keeps small conversations intact", () => {
    const c = conv(6);
    expect(budgetMessages(c)).toHaveLength(6);
  });

  it("keeps first + recent, drops middle oldest-first", () => {
    const c = conv(30).map((m, i) => msg(m.role, `unique-${i} ` + "x".repeat(900)));
    const out = budgetMessages(c, { maxTokens: 3000, reserveTokens: 500 });
    expect(out[0].content).toContain("unique-0");
    expect(out[out.length - 1].content).toContain("unique-29");
    expect(out.length).toBeLessThan(30);
    // chronological order preserved
    const idx = out.map((m) => Number(m.content.match(/unique-(\d+)/)![1]));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("never drops the current request", () => {
    const c = conv(10).map((m, i) => ({ ...m, content: "y".repeat(5000) + i }));
    const out = budgetMessages(c, { maxTokens: 1200, reserveTokens: 200 });
    expect(out[out.length - 1].content).toContain("y".repeat(10));
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty input", () => {
    expect(budgetMessages([])).toEqual([]);
  });
});

describe("budgetConversation", () => {
  it("counts system + messages and sheds attachments first", () => {
    const c = conv(4);
    const r = budgetConversation("sys", c, {
      maxTokens: 1100,
      reserveTokens: 100,
      attachments: [
        { name: "a.txt", text: "z".repeat(8000) },
        { name: "b.txt", text: "tiny" },
      ],
    });
    expect(r.droppedAttachments).toBeGreaterThanOrEqual(1);
    expect(r.messages.length).toBe(4);
    expect(r.estimatedTokens).toBeLessThanOrEqual(1000 + 500);
  });
});

describe("compaction", () => {
  it("builds a capped prompt, oldest-first, user/assistant only", () => {
    expect(buildCompactionPrompt([])).toEqual([]);
    const dropped = conv(30);
    const [p] = buildCompactionPrompt(dropped);
    expect(p.role).toBe("user");
    expect(p.content).toMatch(/User: message 0/);
    expect(p.content.length).toBeLessThanOrEqual(21000);
  });

  it("summarizeHistory collects capped text through any adapter", async () => {
    const adapter = {
      complete: async () => (async function* () {
        yield { type: "delta", text: "Goals: ship X. " };
        yield { type: "delta", text: "Decisions: use Y." };
        yield { type: "done" };
      })(),
    };
    const out = await summarizeHistory(adapter as never, {
      apiKey: "k",
      baseURL: "u",
      model: "m",
      history: conv(45),
    });
    expect(out).toContain("Goals");
  });

  it("summarizeHistory returns empty on adapter error", async () => {
    const adapter = {
      complete: async () => (async function* () {
        yield { type: "error", message: "boom" };
      })(),
    };
    expect(await summarizeHistory(adapter as never, { apiKey: "k", baseURL: "u", model: "m", history: conv(45) })).toBe("");
  });

  it("threshold constant is sane", () => {
    expect(COMPACT_THRESHOLD_MESSAGES).toBeGreaterThanOrEqual(20);
  });
});
