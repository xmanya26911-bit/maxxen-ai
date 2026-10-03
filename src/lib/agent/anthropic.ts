/**
 * Anthropic native tool-loop pieces (Phase 3: Claude drives tools without
 * pretending to be OpenAI).
 *
 * Pure translators + an SSE turn accumulator. Tool EXECUTION stays in the
 * agent route (single confirm-gating path for every provider) — this module
 * only speaks the Messages API wire format both ways. Isomorphic-safe.
 */

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: unknown;
}

/** OpenAI-function shape (as produced by toOpenAITools) → Anthropic shape. */
export function toAnthropicTools(
  openAITools: { function?: { name?: unknown; description?: unknown; parameters?: unknown } }[]
): AnthropicToolDef[] {
  const out: AnthropicToolDef[] = [];
  for (const t of openAITools) {
    const f = t?.function;
    if (!f || typeof f.name !== "string" || !f.name) continue;
    out.push({
      name: f.name,
      description: typeof f.description === "string" && f.description ? f.description.slice(0, 1000) : f.name,
      input_schema:
        f.parameters && typeof f.parameters === "object"
          ? f.parameters
          : { type: "object", properties: {} },
    });
  }
  return out;
}

export type AgentHistoryItem = {
  role: string;
  content: unknown;
  tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[];
  tool_call_id?: unknown;
};

export type AnthropicMessage = { role: "user" | "assistant"; content: unknown };

function asText(content: unknown): string {
  return typeof content === "string" ? content : "";
}

function pushBlock(
  out: AnthropicMessage[],
  role: "user" | "assistant",
  block: Record<string, unknown>
): void {
  const last = out[out.length - 1];
  if (last && last.role === role && Array.isArray(last.content)) {
    (last.content as unknown[]).push(block);
    return;
  }
  if (last && last.role === role && typeof last.content === "string") {
    last.content = [{ type: "text", text: last.content }, block];
    return;
  }
  out.push({ role, content: [block] });
}

function pushText(out: AnthropicMessage[], role: "user" | "assistant", text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.role === role) {
    if (typeof last.content === "string") last.content += "\n\n" + text;
    else if (Array.isArray(last.content)) last.content.push({ type: "text", text });
    return;
  }
  out.push({ role, content: text });
}

/**
 * Agent history → Anthropic messages. The system entry is dropped (passed via
 * the `system` parameter). Consecutive same-role entries are merged — the API
 * rejects back-to-back same-role messages.
 */
export function toAnthropicMessages(history: AgentHistoryItem[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of history) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "system") continue;
    if (m.role === "tool") {
      pushBlock(out, "user", {
        type: "tool_result",
        tool_use_id: String(m.tool_call_id ?? ""),
        content: asText(m.content),
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      pushText(out, "assistant", asText(m.content));
      for (const c of m.tool_calls) {
        let input: unknown = {};
        try {
          input = JSON.parse(typeof c?.function?.arguments === "string" ? c.function.arguments : "{}");
        } catch {
          input = {};
        }
        pushBlock(out, "assistant", {
          type: "tool_use",
          id: String(c?.id ?? ""),
          name: String(c?.function?.name ?? ""),
          input,
        });
      }
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      pushText(out, m.role, asText(m.content));
      continue;
    }
    // Unknown roles are never silently kept — they cannot be represented.
  }
  return out;
}

export interface AnthropicToolUse {
  id: string;
  name: string;
  inputJson: string;
}

export interface AnthropicTurn {
  text: string;
  toolUses: AnthropicToolUse[];
  stopReason: string;
}

/**
 * Accumulate one streamed turn. `onText` forwards live deltas (token by
 * token). Throws on upstream error events; returns partial progress only via
 * throw — callers decide fail-vs-continue like the OpenAI path.
 */
export async function accumulateAnthropicTurn(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
  onText: (t: string) => void
): Promise<AnthropicTurn> {
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let stopReason = "end_turn";
  const uses = new Map<number, AnthropicToolUse>();
  const slot = (index: number): AnthropicToolUse => {
    let s = uses.get(index);
    if (!s) {
      s = { id: "", name: "", inputJson: "" };
      uses.set(index, s);
    }
    return s;
  };
  const handleFrame = (frame: string): void => {
    let event = "";
    const dataLines: string[] = [];
    for (const rawLine of frame.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (!dataLines.length) return;
    const payload = dataLines.join("\n").trim();
    if (!payload || payload === "[DONE]") return;
    let ev: unknown;
    try {
      ev = JSON.parse(payload);
    } catch {
      return; // partial frame — wait for more
    }
    const o = ev as Record<string, unknown>;
    if (event === "error" || (o.type === "error" && o.error)) {
      const err = o.error as { message?: unknown } | undefined;
      throw new Error(typeof err?.message === "string" && err.message ? err.message : "Anthropic stream error.");
    }
    if (event === "content_block_start") {
      const block = o.content_block as { type?: unknown; id?: unknown; name?: unknown; index?: unknown } | undefined;
      const index = typeof o.index === "number" ? o.index : typeof block?.index === "number" ? block.index : 0;
      if (block?.type === "tool_use") {
        const s = slot(index);
        if (typeof block.id === "string") s.id = block.id;
        if (typeof block.name === "string") s.name = block.name;
      }
      return;
    }
    if (event === "content_block_delta") {
      const index = typeof o.index === "number" ? o.index : 0;
      const delta = o.delta as { type?: unknown; text?: unknown; partial_json?: unknown } | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string" && delta.text) {
        text += delta.text;
        onText(delta.text);
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        slot(index).inputJson += delta.partial_json;
      }
      return;
    }
    if (event === "message_delta") {
      const d = o.delta as { stop_reason?: unknown } | undefined;
      if (typeof d?.stop_reason === "string" && d.stop_reason) stopReason = d.stop_reason;
    }
  };
  let aborted = false;
  const abort = () => { aborted = true; void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      if (aborted || signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done || aborted || signal?.aborted) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) handleFrame(part);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
  return { text, toolUses: [...uses.values()].filter((u) => u.name), stopReason };
}
