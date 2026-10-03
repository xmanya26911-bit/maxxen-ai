import type { AgentRun, RuntimeEvent } from "./types";

export class EventLog {
  private readonly events: RuntimeEvent[] = [];
  private sequence = 0;
  constructor(private readonly runId: string) {}

  append(type: RuntimeEvent["type"], data?: unknown): RuntimeEvent {
    const event: RuntimeEvent = {
      id: crypto.randomUUID(),
      runId: this.runId,
      sequence: ++this.sequence,
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    this.events.push(event);
    return event;
  }

  list(afterSequence = 0): RuntimeEvent[] {
    return this.events.filter((e) => e.sequence > afterSequence);
  }
}

export function newAgentRun(goal: string, intent: AgentRun["intent"], opts?: Pick<AgentRun, "conversationId" | "projectId" | "model" | "provider">): AgentRun {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    goal,
    intent,
    status: "queued",
    tasks: [],
    checkpoints: [],
    toolCalls: 0,
    createdAt: now,
    updatedAt: now,
    ...opts,
  };
}
