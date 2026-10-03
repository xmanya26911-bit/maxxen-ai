import type { RuntimeIntent, TaskNode } from "./types";
import { createTaskGraph } from "./task-graph";

export function planForIntent(intent: RuntimeIntent | undefined, goal: string): TaskNode[] {
  const resolvedIntent: RuntimeIntent = intent || "chat";
  const common = [
    { id: "understand", title: "Understand the request and constraints", intent: "chat" as RuntimeIntent },
    { id: "execute", title: "Execute the required work", intent: resolvedIntent, dependsOn: ["understand"] },
    { id: "verify", title: "Verify the result", intent: "chat" as RuntimeIntent, dependsOn: ["execute"] },
  ];
  if (resolvedIntent === "research") {
    common.splice(1, 0, {
      id: "retrieve",
      title: "Retrieve and evaluate relevant sources",
      intent: "research" as RuntimeIntent,
      dependsOn: ["understand"],
    });
  }
  if (resolvedIntent === "code" || resolvedIntent === "create") {
    common.push({
      id: "regression",
      title: "Check for regressions and fix failures",
      intent: "code" as RuntimeIntent,
      dependsOn: ["verify"],
    });
  }
  return createTaskGraph(common.map((x) => ({ ...x, input: goal })));
}
