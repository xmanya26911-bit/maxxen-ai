/**
 * Canonical MAXXEN streaming protocol.
 *
 * ONE wire format for both chat and agent runs. Every event is a member of the
 * `MaxxenEvent` discriminated union, identified by its `type`. The encoder
 * (./encode) turns an event into a Server-Sent-Events frame; the parser
 * (./parse) turns streamed chunks back into these objects. Because chat and
 * agent share the protocol, a single client parser can consume both.
 *
 * The union stays deliberately small: each member carries only the fields the
 * client needs to render or apply it. `artifact.update` and `deployment.update`
 * are part of the contract but their producers arrive with the workspace
 * phases — the parser already understands them so no migration is needed then.
 */

/** Coarse agent activity phase — never private chain-of-thought. */
export type AgentPhase = "planning" | "tool" | "done" | "error";

/** A run (chat or agent) has begun. */
export interface RunStartEvent {
  type: "run.start";
  mode?: string;
  model?: string;
}

/** The assistant message is about to produce content. */
export interface MessageStartEvent {
  type: "message.start";
  messageId?: string;
}

/** A chunk of assistant answer text. */
export interface MessageDeltaEvent {
  type: "message.delta";
  text: string;
}

/** A concise, user-safe agent activity line. */
export interface AgentActivityEvent {
  type: "agent.activity";
  phase: AgentPhase;
  text: string;
  tool?: string;
}

/** A tool call has started. */
export interface ToolStartEvent {
  type: "tool.start";
  callId: string;
  tool: string;
}

/** A streamed chunk of a tool result (typewriter feed). */
export interface ToolDeltaEvent {
  type: "tool.delta";
  callId: string;
  tool: string;
  chunk: string;
}

/** A tool call finished (terminal event for that call). */
export interface ToolResultEvent {
  type: "tool.result";
  callId: string;
  tool: string;
  ok: boolean;
  summary?: string;
  data?: unknown;
}

/** A world-changing action is paused for explicit user confirmation. */
export interface PermissionRequestEvent {
  type: "permission.request";
  tool: string;
  summary: string;
}

/** An artifact was added/updated/removed in the workspace. */
export interface SourceAddEvent {\n  type: "source.add";\n  id: string;\n  title: string;\n  url: string;\n  domain?: string;\n  snippet?: string;\n  publishedAt?: string;\n  kind: "snippet" | "page";\n}\n\nexport interface ArtifactUpdateEvent {
  type: "artifact.update";
  op: "add" | "update" | "remove";
  path?: string;
  lang?: string;
}

/** A deployment changed state. */
export interface DeploymentUpdateEvent {
  type: "deployment.update";
  id: string;
  state: string;
  url?: string;
}

/** A fatal, user-presentable error for the run. */
export interface ErrorEvent {
  type: "error";
  message: string;
  retryable?: boolean;
}

/** The run finished successfully. */
export interface RunCompleteEvent {
  type: "run.complete";
  mode?: string;
}

export type MaxxenEvent =
  | RunStartEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | AgentActivityEvent
  | ToolStartEvent
  | ToolDeltaEvent
  | ToolResultEvent
  | PermissionRequestEvent
  | SourceAddEvent\n  | ArtifactUpdateEvent
  | DeploymentUpdateEvent
  | ErrorEvent
  | RunCompleteEvent;

export type MaxxenEventType = MaxxenEvent["type"];
