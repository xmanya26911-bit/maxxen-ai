import { describe, expect, it } from "vitest";
import { classifyIntent } from "../runtime/intent";
import { createTaskGraph, readyTasks } from "../runtime/task-graph";
import { artifactFromCode, updateArtifact } from "../runtime/artifacts";
import { selectModel } from "../runtime/model-router";

describe("Maxxen runtime primitives", () => {
  it("classifies common requests without a model call", () => {
    expect(classifyIntent("fix the TypeScript build error")).toBe("code");
    expect(classifyIntent("research the latest Next.js release")).toBe("research");
    expect(classifyIntent("remember that my app uses Supabase")).toBe("memory");
  });

  it("validates DAGs and exposes only dependency-ready tasks", () => {
    const tasks = createTaskGraph([
      { id: "inspect", title: "Inspect", intent: "code" },
      { id: "fix", title: "Fix", intent: "code", dependsOn: ["inspect"] },
    ]);
    expect(readyTasks(tasks).map((t) => t.id)).toEqual(["inspect"]);
    const done = tasks.map((t) => t.id === "inspect" ? { ...t, status: "completed" as const } : t);
    expect(readyTasks(done).map((t) => t.id)).toEqual(["fix"]);
  });

  it("versions artifacts instead of mutating history", () => {
    const a = artifactFromCode("app.tsx", "export default 1");
    const b = updateArtifact(a, { content: "export default 2" });
    expect(a.version).toBe(1);
    expect(b.version).toBe(2);
    expect(b.content).toContain("2");
  });

  it("routes only to models satisfying required capabilities", () => {
    const base = {
      tools: true, toolCalling: true, vision: false, audioInput: false, audioOutput: false,
      imageGeneration: false, structuredOutput: false, reasoning: false, parallelToolCalls: false,
      browser: false, python: false, filesystem: false, artifacts: true,
    };
    const selected = selectModel([
      { provider: "x", model: "chat", capabilities: base, reliabilityScore: 5 },
      { provider: "y", model: "vision", capabilities: { ...base, vision: true }, reliabilityScore: 4 },
    ], { vision: true });
    expect(selected?.model).toBe("vision");
  });
});
