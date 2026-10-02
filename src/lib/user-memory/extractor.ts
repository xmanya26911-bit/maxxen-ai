import { scanForSecrets } from "@/lib/secret-scan";
import { sanitizeMemory, type MemoryCandidate, type UserMemory } from "./types";
import { decideOperation, type MergeDecision } from "./merge";
import { buildExtractionPrompt } from "./prompts";

/**
 * Extraction pipeline: conversation → candidates → secret gate → merge plan.
 *
 * The LLM call itself happens in the route (it needs the caller's provider);
 * this module holds everything deterministic: prompt building is in prompts.ts,
 * parsing is tolerant, and NO candidate carrying a secret ever survives —
 * `scanForSecrets` runs on every candidate AND every merged result.
 */

export interface ExtractionResult {
  shouldRemember: boolean;
  candidates: MemoryCandidate[];
}

/** Tolerant parse of the extractor reply (fenced or bare JSON). */
export function parseExtractionResult(text: string): ExtractionResult {
  const empty: ExtractionResult = { shouldRemember: false, candidates: [] };
  if (!text || typeof text !== "string") return empty;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;
  const o = parsed as Record<string, unknown>;
  const raw = Array.isArray(o.memories) ? o.memories.slice(0, 5) : [];
  const candidates: MemoryCandidate[] = [];
  for (const m of raw) {
    const clean = sanitizeMemory(m);
    if (!clean) continue;
    // Secret gate: a candidate echoing credentials dies here, before merge.
    if (scanForSecrets(clean.content).length > 0) continue;
    candidates.push({
      content: clean.content,
      category: clean.category,
      importance: clean.importance,
      confidence: clean.confidence,
    });
  }
  return { shouldRemember: o.shouldRemember === true && candidates.length > 0, candidates };
}

export interface MergePlan {
  creates: MemoryCandidate[];
  updates: UserMemory[];
  deletes: string[];
  ignored: number;
}

/** Plan one batch of candidates against stored memories (pure). */
export function planMerge(candidates: MemoryCandidate[], stored: UserMemory[]): MergePlan {
  const plan: MergePlan = { creates: [], updates: [], deletes: [], ignored: 0 };
  const working = [...stored];
  for (const c of candidates) {
    // Belt-and-braces: secret gate again at plan time.
    if (scanForSecrets(c.content).length > 0) {
      plan.ignored++;
      continue;
    }
    const d: MergeDecision = decideOperation(c, working);
    if (d.op === "IGNORE") plan.ignored++;
    else if (d.op === "CREATE") {
      plan.creates.push(c);
      working.push({ ...c, id: `pending-${plan.creates.length}`, createdAt: "", updatedAt: "", expiresAt: null });
    } else if ((d.op === "UPDATE" || d.op === "MERGE") && d.memory && d.target) {
      plan.updates.push(d.memory);
      const i = working.findIndex((m) => m.id === d.target!.id);
      if (i >= 0) working[i] = d.memory;
    } else plan.ignored++;
  }
  return plan;
}

export { buildExtractionPrompt };
