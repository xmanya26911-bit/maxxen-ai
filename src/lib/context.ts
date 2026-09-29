// Shared context budgeting: crude but real token guard (~48k chars).
// Keeps the system-relevant head (first message = task setup) plus the
// freshest tail. Pure functions with no I/O and no dependencies.
export const MAX_TOTAL_CHARS = 48000;
export const MAX_MSG_CHARS = 12000;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export function sanitizeMessages(input: unknown): ChatMsg[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x: any) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
    .map((x: any) => ({ role: x.role as "user" | "assistant", content: x.content }));
}

export function budgeted(clean: ChatMsg[]): ChatMsg[] {
  const sized = clean.map((m) => ({ ...m, content: m.content.slice(0, MAX_MSG_CHARS) }));
  let total = sized.reduce((n, m) => n + m.content.length, 0);
  if (total <= MAX_TOTAL_CHARS) return sized;
  const first = sized[0];
  const tail: ChatMsg[] = [];
  let keep = MAX_TOTAL_CHARS - Math.min(first.content.length, 6000);
  for (let i = sized.length - 1; i >= 1 && keep > 0; i--) {
    tail.unshift(sized[i]);
    keep -= sized[i].content.length;
  }
  return [first, ...tail];
}

/** Character cap for ONE tool result fed back to the model. */
export const MAX_TOOL_CHARS = 4000;

/**
 * Agent-loop history message. Looser than ChatMsg because the loop appends
 * assistant turns carrying `tool_calls` and `tool` turns carrying results.
 */
export type AgentMsg = {
  role: string;
  content?: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type BudgetedHistory = {
  /** `[system, …kept turns]` — always a valid tool-calling history. */
  messages: AgentMsg[];
  /** How many older turns were dropped to fit the budget (0 = nothing lost). */
  droppedTurns: number;
  /** Total characters actually sent. */
  chars: number;
};

/**
 * Budget the agent loop's history on EVERY step.
 *
 * Why this exists: the loop pushes tool results back into `history` and calls
 * the model again. Without re-budgeting, 6 steps × several tools × 8KB of JSON
 * routinely exceed the provider's context window and the run dies with a 400
 * halfway through real work. The plain chat path does not need this because it
 * never appends anything mid-request.
 *
 * Correctness rules (a malformed history is rejected by OpenAI-compatible
 * providers, so trimming may never break these):
 * - A `tool` message must be preceded by the `assistant` message whose
 *   `tool_calls` it answers.
 * - Trimming therefore happens in whole TURNS: a turn starts at a `user`
 *   message and owns every following assistant/tool message.
 * - Newest turns are always kept; older ones are dropped first.
 */
export function budgetAgentHistory(
  system: string,
  msgs: AgentMsg[],
  total: number = MAX_TOTAL_CHARS
): BudgetedHistory {
  const sizeOf = (m: AgentMsg) => (typeof m.content === "string" ? m.content.length : 0);

  // 1 — per-message caps (a single huge tool result must not dominate).
  const capped: AgentMsg[] = msgs.map((m) => {
    const limit = m.role === "tool" ? MAX_TOOL_CHARS : MAX_MSG_CHARS;
    const text = typeof m.content === "string" ? m.content : m.content == null ? "" : String(m.content);
    return text.length > limit ? { ...m, content: `${text.slice(0, limit)}\n…[truncated by Maxxen]` } : m;
  });

  // 2 — group into turns (never splits an assistant/tool pair).
  const turns: AgentMsg[][] = [];
  for (const m of capped) {
    if (m.role === "user" || turns.length === 0) turns.push([m]);
    else turns[turns.length - 1].push(m);
  }

  // 3 — keep the newest turns that fit, dropping the oldest ones.
  const kept: AgentMsg[][] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const chars = turns[i].reduce((n, m) => n + sizeOf(m), 0);
    if (kept.length > 0 && used + chars > total) break;
    kept.unshift(turns[i]);
    used += chars;
  }
  const droppedTurns = turns.length - kept.length;

  const flat = kept.flat();
  // Defensive: a history may never start with a tool result.
  while (flat.length > 0 && flat[0].role === "tool") flat.shift();

  return {
    messages: [{ role: "system", content: system }, ...flat],
    droppedTurns,
    chars: used,
  };
}
