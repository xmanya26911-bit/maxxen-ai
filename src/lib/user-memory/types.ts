/**
 * User-memory schema — persistent personal memories in the USER's own
 * `maxxen-data` repo (never a central database).
 *
 * Coexists with project memory (lib/memory.ts: per-conversation project
 * facts at `memory/<projectId>.json`). User memories live under
 * `memory/user/<category>.json` — disjoint paths, no format overlap.
 *
 * Memories are UNTRUSTED user data: they personalize responses but can never
 * override system/developer instructions (see prompts.buildMemoryBlock).
 */

export const MEMORY_CATEGORIES = [
  "preference",
  "fact",
  "goal",
  "project",
  "profile",
  "important",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export function isMemoryCategory(v: unknown): v is MemoryCategory {
  return typeof v === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(v);
}

export interface UserMemory {
  id: string;
  content: string;
  category: MemoryCategory;
  /** 0..1 — how much future answers should weigh this. */
  importance: number;
  /** 0..1 — how sure the extractor was. */
  confidence: number;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp or null (null = keeps forever). */
  expiresAt: string | null;
}

export interface MemoryCandidate {
  content: string;
  category: MemoryCategory;
  importance: number;
  confidence: number;
}

export type MemoryOp = "CREATE" | "UPDATE" | "MERGE" | "DELETE" | "IGNORE";

export const MAX_MEMORY_CONTENT_CHARS = 500;
export const MAX_MEMORIES_PER_FILE = 200;

/** Fixed category → repo path mapping. The ONLY user-memory paths ever read or written. */
export const CATEGORY_FILES: Record<MemoryCategory, string> = {
  preference: "memory/user/preferences.json",
  fact: "memory/user/facts.json",
  goal: "memory/user/goals.json",
  project: "memory/user/projects.json",
  profile: "memory/user/profile.json",
  important: "memory/user/important.json",
};

export function newMemoryId(): string {
  const rand = Math.floor(Math.random() * 0xffff).toString(36);
  return `mem_${Date.now().toString(36)}_${rand}`;
}

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(1, Math.max(0, v));
}

/** Trim + cap raw content. Never throws. */
export function sanitizeMemoryContent(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_MEMORY_CONTENT_CHARS);
}

/** Validate an unknown value as a storable UserMemory (unknown fields dropped). */
export function sanitizeMemory(input: unknown): UserMemory | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const content = sanitizeMemoryContent(o.content);
  if (!content) return null;
  const category = isMemoryCategory(o.category) ? o.category : "fact";
  const createdAt = typeof o.createdAt === "string" && o.createdAt ? o.createdAt : new Date().toISOString();
  const updatedAt = typeof o.updatedAt === "string" && o.updatedAt ? o.updatedAt : createdAt;
  const expiresAt = typeof o.expiresAt === "string" && o.expiresAt ? o.expiresAt : null;
  const id = typeof o.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(o.id) ? o.id : newMemoryId();
  return {
    id,
    content,
    category,
    importance: clamp01(o.importance, 0.5),
    confidence: clamp01(o.confidence, 0.5),
    createdAt,
    updatedAt,
    expiresAt,
  };
}

/** A memory is dead when its expiry passed (null = immortal). */
export function isExpired(m: Pick<UserMemory, "expiresAt">, now = Date.now()): boolean {
  if (!m.expiresAt) return false;
  const t = Date.parse(m.expiresAt);
  return Number.isFinite(t) && t <= now;
}
