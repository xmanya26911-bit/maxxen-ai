"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { MEMORY_CATEGORIES, type MemoryCategory, type UserMemory } from "@/lib/user-memory/types";

/**
 * Memory settings section — view/search/edit/delete user memories, toggle
 * automatic memory, sync on demand.
 *
 * Styling mirrors settings-form tokens (same section/field/button classes).
 * Reads the GitHub token from localStorage (same as every other section);
 * without it the section explains what to add instead of failing.
 * Mutations write through to the `maxxen_user_memories` localStorage mirror
 * so chat/agent runs use fresh data immediately.
 */

const FIELD =
  "mx-focus w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30";
const LABEL = "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/40";
const BTN_GHOST =
  "mx-focus mx-press inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[13px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40";
const BTN_DANGER =
  "mx-focus mx-press inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-400/[0.06] px-4 text-[13px] font-medium text-red-200 transition-colors hover:bg-red-400/[0.12] disabled:opacity-40";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "Preferences",
  fact: "Facts",
  goal: "Goals",
  project: "Projects",
  profile: "Profile",
  important: "Important",
};

function ls(key: string, value?: string): string {
  if (typeof window === "undefined") return "";
  if (value === undefined) return window.localStorage.getItem(key) ?? "";
  window.localStorage.setItem(key, value);
  return value;
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const session = useAuthStore.getState().session?.token || "";
  const r = await fetch(path, {
    method: "POST",
    headers: session ? { "Content-Type": "application/json", "x-maxxen-session": session } : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok && data?.ok !== false, data, status: r.status };
}

export function MemorySection() {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");
  // Browser pref, lazily initialized (SSR-safe: ls() returns "" on the
  // server, which maps to the default `true`). No post-mount setState, so
  // no cascading render and no hydration flash.
  const [auto, setAuto] = useState(() => ls("maxxen_memory_auto") !== "0");
  const [busy, setBusy] = useState(false);

  const token = () => ls("maxxen_github_token").trim();

  const mirror = (list: UserMemory[]) => {
    try {
      window.localStorage.setItem("maxxen_user_memories", JSON.stringify(list.slice(0, 120)));
    } catch {
      /* quota — server copy remains source of truth */
    }
  };

  const load = async (silent = false) => {
    const t = token();
    if (!t) {
      setStatus("Add your GitHub token above first — memories live in your maxxen-data repo.");
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { ok, data } = await post("/api/user-memory/list", { githubToken: t });
      if (ok && Array.isArray(data.memories)) {
        const list = data.memories as UserMemory[];
        setMemories(list);
        mirror(list);
        setLoaded(true);
        if (!silent) setStatus(list.length ? `Loaded ${list.length} ${list.length === 1 ? "memory" : "memories"}.` : "No memories yet — they appear here after conversations.");
      } else {
        setStatus(typeof data.error === "string" ? data.error : "Memory load failed.");
      }
    } catch {
      setStatus("Memory load failed — check your connection.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial server-memory load. Deferred one tick so the effect body itself
  // never calls setState synchronously (avoids cascading renders).
  useEffect(() => {
    const timer = window.setTimeout(() => void load(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const mutate = async (ops: unknown[], done: string) => {
    const t = token();
    if (!t || busy) return;
    setBusy(true);
    try {
      const { ok, data } = await post("/api/user-memory/save", { githubToken: t, ops });
      if (ok) {
        setStatus(done);
        await load(true);
      } else {
        setStatus(typeof data.error === "string" ? data.error : "Memory update failed.");
      }
    } catch {
      setStatus("Memory update failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = (id: string) => {
    const text = editText.trim().slice(0, 500);
    if (!text) return;
    setEditingId(null);
    void mutate([{ action: "update", id, patch: { content: text } }], "Memory updated.");
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this memory? This cannot be undone.")) return;
    void mutate([{ action: "delete", id }], "Memory deleted.");
  };

  const add = () => {
    const text = newText.trim().slice(0, 500);
    if (!text) return;
    setAdding(false);
    setNewText("");
    void mutate([{ action: "create", memory: { content: text, category: newCategory } }], "Memory added.");
  };

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    ls("maxxen_memory_auto", next ? "1" : "0");
    setStatus(next ? "Automatic memory on — saved with Save everything." : "Automatic memory off — use Sync now or Remember manually.");
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? memories.filter((m) => m.content.toLowerCase().includes(q) || m.category.includes(q))
    : memories;

  return (
    <section aria-labelledby="memory-h" className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <div className="flex items-center gap-2">
        <h2 id="memory-h" className="text-[15px] font-semibold">Memory</h2>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50">
          {loaded ? `${memories.length} stored` : "Your maxxen-data repo"}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Maxxen remembers useful information to personalize future conversations. Stored only in your private repo.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          onClick={toggleAuto}
          className="mx-focus inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/80 transition-colors hover:border-white/25"
        >
          <span aria-hidden="true" className={auto ? "flex h-4 w-7 items-center rounded-full bg-emerald-400/80 px-0.5" : "flex h-4 w-7 items-center rounded-full bg-white/15 px-0.5"}>
            <span className={cn("h-3 w-3 rounded-full bg-white transition-all", auto ? "ml-auto" : "ml-0")} />
          </span>
          Automatic memory
        </button>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className={BTN_GHOST}>
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
          Sync now
        </button>
        <button type="button" onClick={() => setAdding((v) => !v)} className={BTN_GHOST}>
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
      {adding && (
        <div className="mt-3 grid gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <label className={LABEL} htmlFor="mem-new-text">New memory</label>
          <textarea
            id="mem-new-text"
            className={FIELD}
            rows={2}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="e.g. User prefers dark premium interfaces."
          />
          <div className="flex gap-2">
            <select aria-label="Category" className={cn(FIELD, "max-w-[180px]")} value={newCategory} onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}>
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <button type="button" onClick={add} disabled={busy || !newText.trim()} className={BTN_GHOST}>Save</button>
          </div>
        </div>
      )}
      <div className="mt-3">
        <input
          className={FIELD}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories…"
          aria-label="Search memories"
          autoComplete="off"
        />
      </div>
      {status && (
        <p role="status" className="mt-2 text-[12px] text-white/55">{status}</p>
      )}
      <div className="mt-3 grid gap-4">
        {MEMORY_CATEGORIES.map((c) => {
          const items = visible.filter((m) => m.category === c);
          if (!items.length) return null;
          return (
            <div key={c}>
              <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                {CATEGORY_LABELS[c]} ({items.length})
              </h3>
              <ul className="grid gap-1.5">
                {items.map((m) => (
                  <li key={m.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    {editingId === m.id ? (
                      <div className="grid gap-2">
                        <textarea className={FIELD} rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit memory" />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => saveEdit(m.id)} disabled={busy} className={BTN_GHOST}>
                            <Check size={14} aria-hidden="true" /> Save
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className={BTN_GHOST}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">{m.content}</p>
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingId(m.id); setEditText(m.content); }}
                            aria-label={`Edit memory: ${m.content.slice(0, 40)}`}
                            title="Edit"
                            className="mx-focus rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white"
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(m.id)}
                            aria-label={`Delete memory: ${m.content.slice(0, 40)}`}
                            title="Delete"
                            className="mx-focus rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/[0.07] hover:text-red-200"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                    )}
                    <p className="mt-1 font-mono text-[10px] text-white/30">
                      updated {new Date(m.updatedAt).toLocaleDateString()} · importance {m.importance.toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {loaded && !visible.length && (
          <p className="text-[12.5px] text-white/40">{q ? "No memories match that search." : "No memories yet."}</p>
        )}
      </div>
    </section>
  );
}
