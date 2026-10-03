import type { RuntimeMessage, RuntimeMessagePart } from "./types";

export function textPart(text: string): RuntimeMessagePart {
  return { type: "text", text };
}

export function createMessage(
  role: RuntimeMessage["role"],
  parts: RuntimeMessagePart[],
  metadata?: Record<string, unknown>
): RuntimeMessage {
  return { id: crypto.randomUUID(), role, parts, createdAt: new Date().toISOString(), ...(metadata ? { metadata } : {}) };
}

export function messageText(message: RuntimeMessage): string {
  return message.parts.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n");
}

export function normalizeLegacyMessage(input: { role: RuntimeMessage["role"]; content: string }): RuntimeMessage {
  return createMessage(input.role, [textPart(input.content)]);
}
