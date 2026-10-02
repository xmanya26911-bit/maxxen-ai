import { isExpired, sanitizeMemoryContent, type MemoryOp, type UserMemory } from "./types";
import { overlapScore } from "./relevance";

/**
 * Merge decisions — one candidate against the stored set.
 *
 * Rules (deterministic, no model call):
 * - identical normalized content          → IGNORE
 * - high overlap (>=0.45), same category   → MERGE (keep the richer text)
 * - medium overlap (>=0.35), same category → UPDATE (candidate supersedes)
 * - otherwise                              → CREATE
 * - DELETE is never automatic (except expiry purge); only explicit UI deletes.
 *
 * Merge keeps the LONGER text (it carries the specifics), max importance /
 * confidence, a fresh updatedAt, and preserves the original id + createdAt.
 */

export const MERGE_THRESHOLD = 0.45;
export const UPDATE_THRESHOLD = 0.35;

export function normalize(content: string): string {
  return content.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface MergeDecision {
  op: MemoryOp;
  /** Existing memory this decision targets (UPDATE/MERGE). */
  target?: UserMemory;
  /** Resulting memory for CREATE/UPDATE/MERGE. */
  memory?: UserMemory;
}

export function mergeMemories(existing: UserMemory, incoming: UserMemory, now = new Date().toISOString()): UserMemory {
  const content =
    incoming.content.length >= existing.content.length ? incoming.content : existing.content;
  return {
    ...existing,
    content: sanitizeMemoryContent(content) || existing.content,
    importance: Math.max(existing.importance, incoming.importance),
    confidence: Math.max(existing.confidence, incoming.confidence),
    updatedAt: now,
  };
}

export function decideOperation(
  candidate: Pick<UserMemory, "content" | "category" | "importance" | "confidence">,
  stored: UserMemory[]
): MergeDecision {
  const norm = normalize(candidate.content);
  if (!norm) return { op: "IGNORE" };
  const same = stored.filter((m) => m.category === candidate.category && !isExpired(m));
  for (const m of same) {
    if (normalize(m.content) === norm) return { op: "IGNORE", target: m };
  }
  let best: UserMemory | null = null;
  let bestScore = 0;
  for (const m of same) {
    const s = Math.max(overlapScore(candidate.content, m.content), overlapScore(m.content, candidate.content));
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  if (best && bestScore >= MERGE_THRESHOLD) {
    return {
      op: "MERGE",
      target: best,
      memory: mergeMemories(best, { ...best, ...candidate } as UserMemory),
    };
  }
  if (best && bestScore >= UPDATE_THRESHOLD) {
    return {
      op: "UPDATE",
      target: best,
      memory: {
        ...best,
        content: sanitizeMemoryContent(candidate.content),
        importance: candidate.importance,
        confidence: candidate.confidence,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  return { op: "CREATE" };
}

/** Split a stored set into live vs expired (expired → DELETE candidates). */
export function purgeExpired(memories: UserMemory[], now = Date.now()): { live: UserMemory[]; expired: UserMemory[] } {
  const live: UserMemory[] = [];
  const expired: UserMemory[] = [];
  for (const m of memories) (isExpired(m, now) ? expired : live).push(m);
  return { live, expired };
}
