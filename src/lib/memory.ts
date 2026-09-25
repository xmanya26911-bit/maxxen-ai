/**
 * Project Memory — per-project facts Maxxen must not forget.
 *
 * Each conversation is a project. Its memory (framework, design language,
 * rules) persists in the user's own maxxen-data repo under memory/<id>.json
 * so it survives sessions, plus a localStorage mirror for instant reads.
 * The agent loop injects it into the model context on every run.
 */

export interface ProjectMemory {
  framework: string;
  language: string;
  ui: string;
  database: string;
  design: string[];
  rules: string[];
  updatedAt?: string;
}

export const EMPTY_MEMORY: ProjectMemory = {
  framework: "",
  language: "",
  ui: "",
  database: "",
  design: [],
  rules: [],
};

const KEY = (projectId: string) => `maxxen_memory_${projectId}`;
export const memoryPath = (projectId: string) => `memory/${projectId}.json`;

/** Sanitize + bound untrusted memory payloads (client or repo). */
export function sanitizeMemory(input: unknown): ProjectMemory {
  const out: ProjectMemory = { ...EMPTY_MEMORY, design: [], rules: [] };
  if (!input || typeof input !== "object") return out;
  const o = input as Record<string, unknown>;
  for (const k of ["framework", "language", "ui", "database"] as const) {
    if (typeof o[k] === "string") out[k] = (o[k] as string).slice(0, 120);
  }
  for (const k of ["design", "rules"] as const) {
    if (Array.isArray(o[k])) {
      out[k] = (o[k] as unknown[])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.slice(0, 280))
        .slice(0, 30);
    }
  }
  return out;
}

/** Local mirror read (synchronous, for the agent request path). */
export function readMemoryCache(projectId: string): ProjectMemory | null {
  try {
    const raw = window.localStorage.getItem(KEY(projectId));
    if (!raw) return null;
    return sanitizeMemory(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeMemoryCache(projectId: string, memory: ProjectMemory): void {
  try {
    window.localStorage.setItem(KEY(projectId), JSON.stringify({ ...memory, updatedAt: new Date().toISOString() }));
  } catch {
    /* quota/privacy — server copy remains source of truth */
  }
}

/** Render the memory block appended to the agent system context. */
export function memoryBlock(memory: ProjectMemory | null | undefined): string {
  if (!memory) return "";
  const lines = ["PROJECT MEMORY"];
  if (memory.framework) lines.push(`Framework: ${memory.framework}`);
  if (memory.language) lines.push(`Language: ${memory.language}`);
  if (memory.ui) lines.push(`UI: ${memory.ui}`);
  if (memory.database) lines.push(`Database: ${memory.database}`);
  if (memory.design.length) {
    lines.push("", "Design:");
    for (const d of memory.design) lines.push(`• ${d}`);
  }
  if (memory.rules.length) {
    lines.push("", "Rules:");
    for (const r of memory.rules) lines.push(`• ${r}`);
  }
  if (lines.length <= 1) return "";
  return lines.join("\n");
}
