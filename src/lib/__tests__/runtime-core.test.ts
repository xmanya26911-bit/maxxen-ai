import { describe, expect, it } from "vitest";
import { createMessage, messageText } from "../runtime/message";
import { defineTool, toolSchema } from "../runtime/tool-definition";
import { hybridRetrieve, cosineSimilarity } from "../runtime/retrieval";
import { startMetric, finishMetric, estimateCost } from "../runtime/observability";
import { planForIntent } from "../runtime/agent-plan";
import { summarizeEvals } from "../runtime/evaluation";

describe("Maxxen core runtime", () => {
  it("normalizes rich messages", () => {
    const m = createMessage("user", [{ type: "text", text: "hello" }, { type: "text", text: "world" }]);
    expect(messageText(m)).toBe("hello\nworld");
    expect(m.id).toBeTruthy();
  });

  it("creates validated tool definitions", async () => {
    const t = defineTool({
      name: "repo.read",
      description: "Read a repository file",
      permission: "read",
      inputSchema: { type: "object" },
      execute: async () => ({ ok: true }),
    });
    expect(toolSchema(t).name).toBe("repo.read");
    await expect(Promise.resolve(t.execute({}))).resolves.toEqual({ ok: true });
  });

  it("retrieves relevant documents and supports embeddings", () => {
    const hits = hybridRetrieve("next js build", [
      { id: "a", text: "Next.js build troubleshooting", importance: 1 },
      { id: "b", text: "Football training", importance: 1 },
    ]);
    expect(hits[0]?.id).toBe("a");
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });

  it("tracks runtime cost and duration", () => {
    const m = startMetric({ runId: "r1" });
    const done = finishMetric(m, "completed", { inputTokens: 1000, outputTokens: 500 });
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(estimateCost(1000, 500, 2, 4)).toBeCloseTo(0.004);
  });

  it("builds intent-specific plans", () => {
    const plan = planForIntent("code", "fix the application");
    expect(plan.map((x) => x.id)).toEqual(["understand", "execute", "verify", "regression"]);
    expect(plan[1].dependsOn).toEqual(["understand"]);
  });

  it("summarizes evaluation results", () => {
    expect(summarizeEvals([
      { id: "1", passed: true, assertionResults: [true], output: "", durationMs: 1 },
      { id: "2", passed: false, assertionResults: [false], output: "", durationMs: 1 },
    ])).toEqual({ total: 2, passed: 1, failed: 1, passRate: 0.5 });
  });
});
