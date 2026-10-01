import type { AgentPhase, MaxxenEvent, MaxxenEventType } from "./types";

/** Every event type in the protocol, in one place. */
export const EVENT_TYPES: readonly MaxxenEventType[] = [
  "run.start",
  "message.start",
  "message.delta",
  "agent.activity",
  "tool.start",
  "tool.delta",
  "tool.result",
  "permission.request",
  "artifact.update",
  "deployment.update",
  "error",
  "run.complete",
] as const;

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

const AGENT_PHASES: ReadonlySet<string> = new Set<AgentPhase>(["planning", "tool", "done", "error"]);

const ARTIFACT_OPS: ReadonlySet<string> = new Set(["add", "update", "remove"]);

export function isMaxxenEventType(value: unknown): value is MaxxenEventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/**
 * Validate an unknown value as a MaxxenEvent. Structural per-type checks keep a
 * malformed producer from crashing the consumer; anything that fails is dropped
 * by the parser rather than thrown.
 */
export function isMaxxenEvent(value: unknown): value is MaxxenEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (!isMaxxenEventType(e.type)) return false;
  switch (e.type) {
    case "run.start":
    case "run.complete":
      return (e.mode === undefined || isStr(e.mode)) && (e.model === undefined || isStr(e.model));
    case "message.start":
      return e.messageId === undefined || isStr(e.messageId);
    case "message.delta":
      return isStr(e.text);
    case "agent.activity":
      return isStr(e.text) && isStr(e.phase) && AGENT_PHASES.has(e.phase) && (e.tool === undefined || isStr(e.tool));
    case "tool.start":
      return isStr(e.callId) && isStr(e.tool);
    case "tool.delta":
      return isStr(e.callId) && isStr(e.tool) && isStr(e.chunk);
    case "tool.result":
      return isStr(e.callId) && isStr(e.tool) && isBool(e.ok) && (e.summary === undefined || isStr(e.summary));
    case "permission.request":
      return isStr(e.tool) && isStr(e.summary);
    case "artifact.update":
      return isStr(e.op) && ARTIFACT_OPS.has(e.op) && (e.path === undefined || isStr(e.path)) && (e.lang === undefined || isStr(e.lang));
    case "deployment.update":
      return isStr(e.id) && isStr(e.state) && (e.url === undefined || isStr(e.url));
    case "error":
      return isStr(e.message) && (e.retryable === undefined || isBool(e.retryable));
    default:
      return false;
  }
}
