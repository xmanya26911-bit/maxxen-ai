import type { ToolDef } from "@/lib/tools";

export type RuntimeIntent =
  | "chat" | "research" | "code" | "data" | "create"
  | "browser" | "external_action" | "memory" | "deploy";

export type AgentRunStatus =
  | "queued" | "planning" | "running" | "waiting_user"
  | "paused" | "completed" | "failed" | "cancelled";

export interface RuntimeMessagePart {
  type: "text" | "image" | "file" | "audio" | "video" | "tool_call" | "tool_result" | "citation" | "artifact" | "status";
  text?: string;
  url?: string;
  mimeType?: string;
  name?: string;
  data?: unknown;
}

export interface RuntimeMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  parts: RuntimeMessagePart[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeCapabilities {
  tools: boolean;
  toolCalling: boolean;
  vision: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  imageGeneration: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  parallelToolCalls: boolean;
  browser: boolean;
  python: boolean;
  filesystem: boolean;
  artifacts: boolean;
}

export interface TaskNode {
  id: string;
  title: string;
  intent: RuntimeIntent;
  dependsOn: string[];
  status: "pending" | "running" | "waiting_user" | "completed" | "failed" | "skipped";
  retryCount: number;
  maxRetries: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface AgentRun {
  id: string;
  conversationId?: string;
  projectId?: string;
  goal: string;
  status: AgentRunStatus;
  intent: RuntimeIntent;
  tasks: TaskNode[];
  currentTaskId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  checkpoints: string[];
  toolCalls: number;
  model?: string;
  provider?: string;
  error?: string;
}

export interface Artifact {
  id: string;
  kind: "code" | "document" | "spreadsheet" | "chart" | "image" | "website" | "data" | "file";
  name: string;
  version: number;
  content?: string;
  mimeType?: string;
  files?: Array<{ path: string; content: string; mimeType?: string }>;
  createdAt: string;
  updatedAt: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeEvent {
  id: string;
  runId: string;
  sequence: number;
  type:
    | "run.created" | "run.planning" | "plan.created" | "task.started"
    | "task.completed" | "task.failed" | "tool.requested" | "tool.started"
    | "tool.progress" | "tool.completed" | "tool.failed" | "approval.requested"
    | "artifact.created" | "artifact.updated" | "checkpoint.created"
    | "model.switched" | "run.paused" | "run.resumed" | "run.completed" | "run.failed";
  timestamp: string;
  data?: unknown;
}
