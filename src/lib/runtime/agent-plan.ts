import type { RuntimeIntent, TaskNode } from "./types";
import { createTaskGraph } from "./task-graph";

export function planForIntent(intent: RuntimeIntent, goal: string): TaskNode[] {
  const common = [
    { id: "understand", title: "Understand the request and constraints", intent: "chat" as RuntimeIntent },
    { id: "execute", title: "Execute the required work", intent, dependsOn: ["understand"] },
    { id: "verify", title: "Verify the result", intent: "chat" as RuntimeIntent, dependsOn: ["execute"] },
  ];
  if (intent === "research") common.splice(1, 0, { id: "retrieve", title: "Retrieve and evaluate relevant sources", intent: "research", dependsOn: ["understand"] });
  if (intent === "code" || intent === "create") common.push({ id: "regression", title: "Check for regressions and fix failures", intent: "code", dependsOn: ["verify"] });
  return createTaskGraph(common.map((x) => ({ ...x, input: goal })));
}
