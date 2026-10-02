import type { Octokit } from "octokit";
import {
  CATEGORY_FILES,
  MAX_MEMORIES_PER_FILE,
  isMemoryCategory,
  newMemoryId,
  sanitizeMemory,
  type MemoryCategory,
  type UserMemory,
} from "./types";
import { keywordRetrieve, type MemoryRetriever, type ScoredMemory } from "./relevance";
import { planMerge } from "./extractor";
import type { MemoryCandidate } from "./types";

/**
 * Storage seam: `MemoryStore` is the interface the routes/UI depend on;
 * `GitHubMemoryStore` implements it over an injected `MemoryIO` so tests
 * never touch the network and a future provider (local file, other git host)
 * slots in without rewriting callers.
 *
 * Server routes construct the IO over octokit (caller's token, their
 * `maxxen-data` repo, `memory/user/*.json` fixed paths only).
 */

export interface MemoryStore {
  getAll(): Promise<UserMemory[]>;
  getByCategory(category: MemoryCategory): Promise<UserMemory[]>;
  getRelevant(query: string, limit?: number): Promise<ScoredMemory[]>;
  /** Apply one batch of candidates (merge-planned): returns what changed. */
  applyCandidates(candidates: MemoryCandidate[]): Promise<{ created: number; updated: number; ignored: number }>;
  update(id: string, patch: Partial<UserMemory>): Promise<UserMemory | null>;
  delete(id: string): Promise<boolean>;
}

export interface MemoryIO {
  read(path: string): Promise<{ text: string; sha: string } | null>;
  write(path: string, text: string, sha?: string): Promise<void>;
}

async function readCategory(io: MemoryIO, category: MemoryCategory): Promise<{ memories: UserMemory[]; sha?: string }> {
  const path = CATEGORY_FILES[category];
  let raw: { text: string; sha: string } | null = null;
  try {
    raw = await io.read(path);
  } catch {
    return { memories: [] }; // transient failure reads as empty, never throws
  }
  if (!raw) return { memories: [] }; // missing file = empty category
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.text);
  } catch {
    return { memories: [] }; // corrupt file quarantined (never merged into results)
  }
  const list = Array.isArray(parsed) ? parsed : [];
  const memories: UserMemory[] = [];
  for (const item of list.slice(0, MAX_MEMORIES_PER_FILE)) {
    const m = sanitizeMemory(item);
    if (m) memories.push(m);
  }
  return { memories, sha: raw.sha };
}

export class GitHubMemoryStore implements MemoryStore {
  private retriever: MemoryRetriever;
  constructor(private io: MemoryIO, retriever?: MemoryRetriever) {
    this.retriever = retriever ?? { retrieve: (q, m, l) => keywordRetrieve(q, m, l) };
  }

  async getAll(): Promise<UserMemory[]> {
    const out: UserMemory[] = [];
    for (const c of Object.keys(CATEGORY_FILES) as MemoryCategory[]) {
      out.push(...(await readCategory(this.io, c)).memories);
    }
    return out;
  }

  async getByCategory(category: MemoryCategory): Promise<UserMemory[]> {
    return (await readCategory(this.io, category)).memories;
  }

  async getRelevant(query: string, limit = 8): Promise<ScoredMemory[]> {
    return this.retriever.retrieve(query, await this.getAll(), limit);
  }

  async applyCandidates(candidates: MemoryCandidate[]): Promise<{ created: number; updated: number; ignored: number }> {
    if (!candidates.length) return { created: 0, updated: 0, ignored: 0 };
    const stored = await this.getAll();
    const plan = planMerge(candidates, stored);
    const now = new Date().toISOString();
    // Group writes per category file: ONE GitHub update per touched file.
    const touched = new Map<MemoryCategory, { memories: UserMemory[]; sha?: string }>();
    const ensure = async (c: MemoryCategory) => {
      let t = touched.get(c);
      if (!t) {
        t = await readCategory(this.io, c);
        touched.set(c, t);
      }
      return t;
    };
    for (const c of plan.creates) {
      const t = await ensure(c.category);
      if (t.memories.length >= MAX_MEMORIES_PER_FILE) continue;
      t.memories.push({
        id: newMemoryId(),
        content: c.content,
        category: c.category,
        importance: c.importance,
        confidence: c.confidence,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      });
    }
    for (const u of plan.updates) {
      const t = await ensure(u.category);
      const i = t.memories.findIndex((m) => m.id === u.id);
      if (i >= 0) t.memories[i] = { ...u, updatedAt: now };
      else if (t.memories.length < MAX_MEMORIES_PER_FILE) t.memories.push({ ...u, updatedAt: now });
    }
    let written = 0;
    for (const [c, t] of touched) {
      if (written > 0) await new Promise((r) => setTimeout(r, 300));
      await this.io.write(CATEGORY_FILES[c], JSON.stringify(t.memories, null, 2), t.sha);
      written++;
    }
    return { created: plan.creates.length, updated: plan.updates.length, ignored: plan.ignored };
  }

  async update(id: string, patch: Partial<UserMemory>): Promise<UserMemory | null> {
    for (const c of Object.keys(CATEGORY_FILES) as MemoryCategory[]) {
      const t = await readCategory(this.io, c);
      const i = t.memories.findIndex((m) => m.id === id);
      if (i < 0) continue;
      const next = sanitizeMemory({ ...t.memories[i], ...patch, id, category: t.memories[i].category });
      if (!next) return null;
      if (patch.category && isMemoryCategory(patch.category) && patch.category !== c) {
        await this.delete(id);
        const tc = await readCategory(this.io, patch.category);
        tc.memories.push({ ...next, category: patch.category, updatedAt: new Date().toISOString() });
        await this.io.write(CATEGORY_FILES[patch.category], JSON.stringify(tc.memories, null, 2), tc.sha);
        return { ...next, category: patch.category };
      }
      t.memories[i] = { ...next, updatedAt: new Date().toISOString() };
      await this.io.write(CATEGORY_FILES[c], JSON.stringify(t.memories, null, 2), t.sha);
      return t.memories[i];
    }
    return null;
  }

  async delete(id: string): Promise<boolean> {
    for (const c of Object.keys(CATEGORY_FILES) as MemoryCategory[]) {
      const t = await readCategory(this.io, c);
      const i = t.memories.findIndex((m) => m.id === id);
      if (i < 0) continue;
      t.memories.splice(i, 1);
      await this.io.write(CATEGORY_FILES[c], JSON.stringify(t.memories, null, 2), t.sha);
      return true;
    }
    return false;
  }
}

/** Octokit-backed IO: caller's token, their maxxen-data repo, fixed paths. */
export function octokitMemoryIO(oct: Octokit, owner: string, repo: string): MemoryIO {
  return {
    async read(path: string) {
      try {
        const cur: unknown = await oct.rest.repos.getContent({ owner, repo, path });
        const d = (cur as { data: unknown }).data;
        if (Array.isArray(d) || (d as { type?: string }).type !== "file") return null;
        const file = d as { content?: string; sha: string; size?: number };
        if (typeof file.content !== "string" || (file.size ?? 0) > 500000) return null;
        return { text: Buffer.from(file.content, "base64").toString("utf-8"), sha: file.sha };
      } catch (e: unknown) {
        const st = (e as { status?: number })?.status;
        if (st === 404) return null;
        throw e;
      }
    },
    async write(path: string, text: string, sha?: string) {
      if (text.length > 500000) throw new Error("Memory file too large.");
      // SHA retry: refetch once on conflict so concurrent updates don't lose memories.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await oct.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `maxxen: sync user memory (${path})`,
            content: Buffer.from(text).toString("base64"),
            sha,
          });
          return;
        } catch (e: unknown) {
          const st = (e as { status?: number })?.status;
          const msg = e instanceof Error ? e.message : "";
          const conflict = st === 409 || /sha/i.test(msg);
          if (conflict && attempt === 0) {
            const fresh = await this.read(path);
            sha = fresh?.sha;
            continue;
          }
          throw e;
        }
      }
    },
  };
}
