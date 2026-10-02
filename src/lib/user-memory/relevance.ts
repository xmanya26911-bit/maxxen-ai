import { isExpired, type UserMemory } from "./types";

/**
 * Deterministic relevance scoring (no embeddings in the repo — nothing to reuse).
 *
 * Scores query/memory token overlap, weighted by importance x confidence, so
 * stable preferences outrank passing mentions. Pure functions, easily
 * unit-tested; the `MemoryRetriever` interface lets a vector retriever slot
 * in later without touching callers.
 */

export interface ScoredMemory {
  memory: UserMemory;
  score: number;
}

export interface MemoryRetriever {
  retrieve(query: string, memories: UserMemory[], limit: number): ScoredMemory[];
}

const STOPWORDS =
  "a,an,the,and,or,but,is,are,was,were,be,to,of,in,on,for,with,do,does,did,i,you,he,she,it,we,they,my,your,his,her,its,our,their,me,him,us,them,what,when,where,which,who,how,can,could,should,would,will,just,very,so,than,too,about,into,over,after,please,thanks,thank,hello,hi,hey,ok,yes,no,not,at,by,from,as,also,make,made,using,use,used,get,got,let,like,want,need,know,think,see,look,show,tell,give,take,come,go,better,new,own,app,ai,maxxen";
const STOP = new Set(STOPWORDS.split(","));

export function tokens(text: string): string[] {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return [...out];
}

/** 0..1 overlap of query tokens into memory tokens. */
export function overlapScore(query: string, content: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const c = new Set(tokens(content));
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  return hit / q.length;
}

/** Relevance = overlap x importance x confidence. Expired memories score 0. */
export function scoreRelevance(query: string, memory: UserMemory): number {
  if (isExpired(memory)) return 0;
  return overlapScore(query, memory.content) * memory.importance * memory.confidence;
}

/** Default keyword retriever: top `limit` memories above `minScore`, stable order. */
export function keywordRetrieve(
  query: string,
  memories: UserMemory[],
  limit = 8,
  minScore = 0.05
): ScoredMemory[] {
  return memories
    .map((memory) => ({ memory, score: scoreRelevance(query, memory) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance)
    .slice(0, Math.max(0, limit));
}

export const keywordRetriever: MemoryRetriever = {
  retrieve: (query, memories, limit) => keywordRetrieve(query, memories, limit),
};
