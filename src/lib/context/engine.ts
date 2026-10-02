/**
 * Context engine (Phase 4): token-aware budgeting + conversation compaction.
 *
 * Replaces pure character-slicing with priority-aware selection:
 * system always kept, first message (task setup) + recent tail preserved,
 * middle dropped oldest-first, current request never dropped. Tool-result
 * truncation happens at write time in the agent loop (8k cap); this module
 * bounds the pre-loop window.
 *
 * Tokenization: no tokenizer dependency in the repo, so a documented safe
 * approximation is used — ~4 chars/token (English/code mix). It OVERESTIMATES
 * safety margin for CJK/dense text (more real tokens than estimated), which
 * fails toward truncation, never toward overflow. Per-message +4 overhead
 * mirrors OpenAI-style framing.
 *
 * Attachments: budgeted as lowest-priority blocks via budgetConversation()
 * (producers land in Phase 7; the interface + caps are fixed here).
 * Isomorphic-safe (type-only provider import).
 */
import type { ChatMsg } from "./context";
import type { ProviderAdapter } from "../ai/types";

export const CHARS_PER_TOKEN = 4;
export const MESSAGE_OVERHEAD_TOKENS = 4;
export const DEFAULT_MAX_TOKENS = 12_000;
export const DEFAULT_RESERVE_TOKENS = 2_000;
export const DEFAULT_KEEP_RECENT = 10;

export const COMPACT_THRESHOLD_MESSAGES = 40;
export const COMPACT_KEEP_RECENT = 20;
export const COMPACT_SUMMARY_CHARS = 1_500;
export const COMPACT_INPUT_CHARS = 20_000;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function messageTokens(m: Pick<ChatMsg, "content">): number {
  return estimateTokens(typeof m.content === "string" ? m.content : "") + MESSAGE_OVERHEAD_TOKENS;
}

export interface BudgetOptions {
  maxTokens?: number;
  reserveTokens?: number;
  keepRecent?: number;
}

/**
 * Priority-aware window: [first (task setup)] + newest-fitting middle +
 * [recent tail]. The LAST message (current request) is never dropped and
 * never truncated — sacrifice order is middle → first → (request survives).
 */
export function budgetMessages(messages: ChatMsg[], opts: BudgetOptions = {}): ChatMsg[] {
  if (!messages.length) return [];
  const keepRecent = Math.max(1, opts.keepRecent ?? DEFAULT_KEEP_RECENT);
  const budget = Math.max(1000, (opts.maxTokens ?? DEFAULT_MAX_TOKENS) - (opts.reserveTokens ?? DEFAULT_RESERVE_TOKENS));
  if (messages.length === 1) return [...messages];
  const first = messages[0];
  const rest = messages.slice(1);
  const recent = rest.slice(-keepRecent);
  const middle = rest.slice(0, Math.max(0, rest.length - keepRecent));
  const cost = (list: ChatMsg[]) => list.reduce((n, m) => n + messageTokens(m), 0);
  let used = messageTokens(first) + cost(recent);
  // Fill newest middle first, keep chronological order.
  const fitting: ChatMsg[] = [];
  for (let i = middle.length - 1; i >= 0; i--) {
    const c = messageTokens(middle[i]);
    if (used + c <= budget) {
      fitting.unshift(middle[i]);
      used += c;
    }
  }
  let selected = [first, ...fitting, ...recent];
  // Over budget (giant first/recent): drop from the front, never the request.
  while (selected.length > 1 && cost(selected) > budget) {
    selected = selected.slice(1);
  }
  return selected;
}

export interface AttachmentInput {
  name: string;
  text: string;
}

export interface BudgetedConversation {
  messages: ChatMsg[];
  /** Attachment excerpts that fit (lowest priority — first to go). */
  attachmentBlocks: string[];
  droppedMessages: number;
  droppedAttachments: number;
  estimatedTokens: number;
}

/** Full window: system + budgeted messages + fitting attachments. */
export function budgetConversation(
  system: string,
  messages: ChatMsg[],
  opts: BudgetOptions & { attachments?: AttachmentInput[] } = {}
): BudgetedConversation {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const reserve = opts.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const budget = Math.max(1000, maxTokens - reserve);
  const selected = budgetMessages(messages, opts);
  let used = estimateTokens(system) + selected.reduce((n, m) => n + messageTokens(m), 0);
  const attachmentBlocks: string[] = [];
  let droppedAttachments = 0;
  for (const a of opts.attachments ?? []) {
    const block = `Attachment ${a.name.slice(0, 80)}:\n${a.text.slice(0, 3000)}`;
    const c = estimateTokens(block);
    if (used + c <= budget) {
      attachmentBlocks.push(block);
      used += c;
    } else {
      droppedAttachments++;
    }
  }
  return {
    messages: selected,
    attachmentBlocks,
    droppedMessages: messages.length - selected.length,
    droppedAttachments,
    estimatedTokens: used,
  };
}

export const COMPACTION_SYSTEM = `Summarize this conversation for context compression. Output plain text under 200 words covering: the user's goals, decisions already made, important technical facts (files, APIs, versions), unresolved tasks, and project context. Omit greetings, chit-chat, and failed attempts. Never invent details. No preamble, just the summary.`;

/** Oldest-first turns capped for the summarizer (never the whole window). */
export function buildCompactionPrompt(dropped: ChatMsg[]): { role: "user"; content: string }[] {
  const turns: string[] = [];
  let chars = 0;
  for (const m of dropped) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const line = `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 800)}`;
    if (chars + line.length > COMPACT_INPUT_CHARS) break;
    turns.push(line);
    chars += line.length;
  }
  if (!turns.length) return [];
  return [{ role: "user", content: `Summarize this earlier conversation for compression:\n\n${turns.join("\n")}` }];
}

/**
 * Summarize dropped turns through any provider adapter (streaming, capped).
 * Returns "" on any failure — callers fall back to the plain budgeted window.
 */
export async function summarizeHistory(
  adapter: Pick<ProviderAdapter, "complete">,
  req: {
    apiKey: string;
    baseURL: string;
    model: string;
    history: ChatMsg[];
    signal?: AbortSignal;
  }
): Promise<string> {
  try {
    const input = buildCompactionPrompt(req.history);
    if (!input.length) return "";
    const events = await adapter.complete({
      apiKey: req.apiKey,
      baseURL: req.baseURL,
      model: req.model,
      system: COMPACTION_SYSTEM,
      messages: input,
      temperature: 0.2,
      signal: req.signal,
    });
    let out = "";
    for await (const ev of events) {
      if (req.signal?.aborted) break;
      if (ev.type === "delta") {
        out += ev.text;
        if (out.length >= COMPACT_SUMMARY_CHARS) break;
      } else if (ev.type === "error") {
        return "";
      }
    }
    return out.trim().slice(0, COMPACT_SUMMARY_CHARS);
  } catch {
    return "";
  }
}
