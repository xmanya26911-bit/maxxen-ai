import type { AgentRun, AgentRunStatus, RuntimeEvent } from "./types";

export interface AgentJob extends AgentRun {
  cancelRequested: boolean;
  events: RuntimeEvent[];
}

const globalKey = "__MAXXEN_AGENT_JOBS__";
type JobMap = Map<string, AgentJob>;

function store(): JobMap {
  const g = globalThis as typeof globalThis & { [globalKey]?: JobMap };
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey]!;
}

export function createJob(run: AgentRun): AgentJob {
  const job: AgentJob = { ...run, cancelRequested: false, events: [] };
  store().set(job.id, job);
  return structuredClone(job);
}

export function getJob(id: string): AgentJob | null {
  const job = store().get(id);
  return job ? structuredClone(job) : null;
}

export function updateJob(id: string, patch: Partial<AgentJob>): AgentJob | null {
  const current = store().get(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  store().set(id, next);
  return structuredClone(next);
}

export function requestCancel(id: string): AgentJob | null {
  return updateJob(id, { cancelRequested: true, status: "cancelled" as AgentRunStatus });
}

export function appendJobEvent(id: string, event: RuntimeEvent): AgentJob | null {
  const current = store().get(id);
  if (!current) return null;
  current.events.push(event);
  current.updatedAt = new Date().toISOString();
  store().set(id, current);
  return structuredClone(current);
}
