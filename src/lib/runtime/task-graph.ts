import type { RuntimeIntent, TaskNode } from "./types";

export interface TaskSpec {
  id: string;
  title: string;
  intent?: RuntimeIntent;
  dependsOn?: string[];
  maxRetries?: number;
  input?: unknown;
}

export function createTaskGraph(specs: TaskSpec[]): TaskNode[] {
  const ids = new Set(specs.map((s) => s.id));
  if (ids.size !== specs.length) throw new Error("Task graph contains duplicate task ids.");
  for (const s of specs) for (const dep of s.dependsOn || []) if (!ids.has(dep)) throw new Error(`Task "${s.id}" depends on missing task "${dep}".`);
  const state = new Map<string, number>();
  const visit = (id: string) => {
    const mark = state.get(id) || 0;
    if (mark === 1) throw new Error("Task graph contains a dependency cycle.");
    if (mark === 2) return;
    state.set(id, 1);
    const spec = specs.find((s) => s.id === id)!;
    for (const dep of spec.dependsOn || []) visit(dep);
    state.set(id, 2);
  };
  for (const s of specs) visit(s.id);
  return specs.map((s) => ({
    id: s.id,
    title: s.title,
    intent: s.intent || "chat",
    dependsOn: [...(s.dependsOn || [])],
    status: "pending",
    retryCount: 0,
    maxRetries: Math.max(0, Math.min(10, s.maxRetries ?? 2)),
    input: s.input,
  }));
}

export function readyTasks(tasks: TaskNode[]): TaskNode[] {
  const done = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  return tasks.filter((t) => t.status === "pending" && t.dependsOn.every((d) => done.has(d)));
}

export function markTask(tasks: TaskNode[], id: string, patch: Partial<TaskNode>): TaskNode[] {
  return tasks.map((t) => t.id === id ? { ...t, ...patch } : t);
}
