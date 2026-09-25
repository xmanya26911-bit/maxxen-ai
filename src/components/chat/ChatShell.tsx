"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Bell, Github, Lock, Menu, PanelRight } from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import Composer from "./Composer";
import EmptyState from "./EmptyState";
import MessageRow from "./MessageRow";
import Sidebar from "./Sidebar";
import WorkspacePane from "./WorkspacePane";
import { extractBlocks } from "./blocks";
import { uid, useChatStore } from "./store";

/** Project memory for one conversation (null when untouched). Never throws. */
function readMemoryCacheSafe(convId: string): unknown {
  try {
    const raw = window.localStorage.getItem(`maxxen_memory_${convId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Refresh the local memory mirror from the user's repo (best-effort). */
async function refreshMemoryCache(convId: string): Promise<void> {
  try {
    const token = window.localStorage.getItem("maxxen_github_token") || "";
    if (!token || !convId) return;
    const r = await fetch("/api/memory/load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ githubToken: token, project: convId }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.memory) {
      window.localStorage.setItem(`maxxen_memory_${convId}`, JSON.stringify(j.memory));
    }
  } catch {
    /* offline — cached copy (if any) still applies */
  }
}
import { useAuthStore } from "@/lib/auth-store";
import { validateSession } from "@/lib/auth-api";
import { getEndpoint } from "@/lib/endpoint";
import {
  clearFinished,
  isTerminal,
  markAllSeen,
  pollWatch,
  readWatches,
  type DeployWatch,
} from "@/lib/notify-watch";
import { useRouter } from "next/navigation";
import type { ChatMode, CodeBlock, Message } from "./types";

/** BYOK endpoint — per-provider key, legacy single key as fallback. */
function endpointCredentials() {
  if (typeof window === "undefined") return null;
  return getEndpoint();
}

/**
 * ChatShell — the full /chat experience, now the REAL 3-pane MAXXEN workspace:
 * Sidebar | center column (header, thread, composer) | WorkspacePane.
 * The workspace pane is docked at xl+ and opens as a right overlay below xl
 * via the PanelRight header toggle (only when artifacts exist).
 *
 * Owns the streaming logic against POST /api/chat:
 * request body { messages: [{ role, content }, …] (last 16, oldest first),
 * mode }, response = text/plain stream of raw chunks; non-200 = JSON { error }.
 */

/** Number of trailing messages sent to /api/chat (oldest first). */
const MAX_HISTORY = 16;

/** Wire format for the /api/chat request body. */
interface ApiMessage {
  role: Message["role"];
  content: string;
}

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_BLOCKS: CodeBlock[] = [];
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** MAXXEN's public repo (hardcoded locally — constants.ts is read-only for chat). */
const GITHUB_URL = "https://github.com/xmanya26911-bit/maxxen-ai";

/** Drop placeholder/failed assistant rows, keep the last MAX_HISTORY turns. */
function toApiHistory(messages: Message[]): ApiMessage[] {
  return messages
    .filter((m) => !(m.role === "assistant" && (m.failed || m.content.trim() === "")))
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));
}

const subscribeNever = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * Notifications bell — watches YOUR deployments and badges when one lands.
 * Polls the real /api/vercel/status for unfinished watches (30s cadence,
 * only while any watch is unfinished). Terminal states stay listed until
 * cleared; opening the panel marks everything seen.
 */
function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [watches, setWatches] = useState<DeployWatch[]>([]);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const refresh = useCallback(async () => {
    const current = readWatches();
    const pending = current.filter((w) => !isTerminal(w.state));
    if (pending.length === 0) {
      setWatches(current);
      return;
    }
    await Promise.all(pending.map((w) => pollWatch(w.id)));
    if (openRef.current) markAllSeen();
    setWatches(readWatches());
  }, []);

  useEffect(() => {
    // Deferred: the first refresh may set state synchronously (empty list).
    const t0 = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => {
      if (readWatches().some((w) => !isTerminal(w.state))) void refresh();
    }, 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      markAllSeen();
      setWatches(readWatches());
      void refresh();
    }
  };

  const unseen = watches.filter((w) => !w.seen && isTerminal(w.state)).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unseen > 0 ? `Notifications, ${unseen} unread` : "Notifications"}
        aria-expanded={open}
        className="mx-focus relative rounded-lg p-2 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <Bell size={16} aria-hidden="true" />
        {unseen > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-white px-0.5 font-mono text-[8.5px] font-bold text-black"
          >
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            role="dialog"
            aria-label="Deploy notifications"
            className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#101014] shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Deploys</p>
              {watches.some((w) => isTerminal(w.state)) && (
                <button
                  type="button"
                  onClick={() => {
                    clearFinished();
                    setWatches(readWatches());
                  }}
                  className="mx-focus ml-auto font-mono text-[10px] text-white/45 transition-colors hover:text-white"
                >
                  Clear finished
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-auto p-1.5" aria-live="polite">
              {watches.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-white/40">
                  No deployments tracked yet — deploy from the workspace pane.
                </p>
              ) : (
                [...watches].reverse().map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        w.state === "ready"
                          ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300"
                          : w.state === "working"
                            ? "h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white/60"
                            : "h-1.5 w-1.5 shrink-0 rounded-full bg-red-300"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white/85">{w.label || w.id.slice(0, 12)}</p>
                      <p className="truncate font-mono text-[10px] text-white/40">
                        {w.state === "working" ? "building…" : w.state === "ready" ? "live ✓" : w.state}
                      </p>
                    </div>
                    {w.url && w.state === "ready" && (
                      <a
                        href={w.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${w.label || "deployment"}`}
                        className="mx-focus shrink-0 rounded-md px-1.5 py-1 font-mono text-[10.5px] text-white/60 transition-colors hover:text-white"
                      >
                        Open →
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ChatShell() {
  const router = useRouter();
  const mounted = useMounted();
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paneOpen, setPaneOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [pinned, setPinned] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const streaming = useChatStore((s) => s.streaming);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );
  const messages = useMemo(
    () => activeConversation?.messages ?? EMPTY_MESSAGES,
    [activeConversation]
  );

  // Latest successful assistant turn — the artifact source.
  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant" && !m.failed) ?? null,
    [messages]
  );
  const lastAssistantContent = lastAssistant?.content ?? "";
  const blocks = useMemo(
    () => (lastAssistantContent ? extractBlocks(lastAssistantContent) : EMPTY_BLOCKS),
    [lastAssistantContent]
  );

  // Every version of every file across the thread (oldest first) — powers
  // the version history + diff + revert controls in the workspace pane.
  const threadVersions = useMemo(() => {
    const counters = new Map<string, number>();
    const out: { key: string; path?: string; lang: string; code: string; label: string }[] = [];
    for (const m of messages) {
      if (m.role !== "assistant" || m.failed) continue;
      const list = m.blocks && m.blocks.length ? m.blocks : extractBlocks(m.content);
      for (const b of list) {
        const key = b.path || `${b.lang}:snippet`;
        const n = (counters.get(key) ?? 0) + 1;
        counters.set(key, n);
        out.push({ key, path: b.path, lang: b.lang, code: b.code, label: `v${n}` });
      }
    }
    return out;
  }, [messages]);

  // Auth gate: no session → /login; stale token → sign out + /login.
  useEffect(() => {
    if (!mounted) return;
    (async () => {
      const session = useAuthStore.getState().session;
      if (!session) {
        router.replace("/login");
        return;
      }
      if (session.token) {
        const email = await validateSession(session.token);
        if (!email) {
          useAuthStore.getState().signOut();
          router.replace("/login");
          return;
        }
      }
      setAuthChecked(true);
    })();
  }, [mounted, router]);

  // Reset follow-mode when switching conversations (render-phase adjustment).
  const [pinnedConv, setPinnedConv] = useState<string | null>(null);
  if (pinnedConv !== activeId) {
    setPinnedConv(activeId);
    setPinned(true);
  }

  // Pull this conversation's project memory into the local mirror so the
  // next agent run carries it (best-effort; cached copy applies meanwhile).
  useEffect(() => {
    if (activeId) void refreshMemoryCache(activeId);
  }, [activeId]);

  // Visual-builder handoff: the preview pane dispatches element Explain /
  // Rewrite requests here so they send as real user messages (current mode).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== "string" || !text.trim()) return;
      void sendMessageRef.current(text);
    };
    window.addEventListener("maxxen:send-prompt", onPrompt);
    return () => window.removeEventListener("maxxen:send-prompt", onPrompt);
  }, []);

  // Close overlays with Escape.
  useEffect(() => {
    if (!mobileOpen && !paneOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setPaneOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, paneOpen]);

  // The artifact overlay only exists while blocks do (render-phase adjustment).
  if (paneOpen && blocks.length === 0) {
    setPaneOpen(false);
  }

  // Keep the thread pinned to the bottom unless the user scrolled up >120px.
  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }, [messages, pinned]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closePane = useCallback(() => setPaneOpen(false), []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance <= 120);
  }, []);

  const jumpToLatest = useCallback(() => {
    setPinned(true);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [reduceMotion]);

  /** Streams a completion into an existing (empty) assistant message. */
  const runCompletion = useCallback(
    async (convId: string, assistantId: string, history: ApiMessage[], requestMode: ChatMode) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let acc = "";
      let raf = 0;

      // rAF-throttled store writes while chunks arrive.
      const flush = () => {
        raf = 0;
        useChatStore.getState().patchMessage(convId, assistantId, { content: acc });
      };

      useChatStore.getState().setStreaming(true);
      setPinned(true);

      let ok = false;
      try {
        const endpoint = endpointCredentials();
        if (!endpoint) {
          throw new Error("Add your provider key in Settings → Endpoint, then retry.");
        }
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, mode: requestMode, ...endpoint }),
          signal: controller.signal,
        });
        if (!res.ok) {
          let message = `Request failed with status ${res.status}.`;
          try {
            const data = (await res.json()) as { error?: unknown };
            if (typeof data?.error === "string" && data.error.trim()) message = data.error;
          } catch {
            /* body was not JSON */
          }
          throw new Error(message);
        }
        if (!res.body) throw new Error("Streaming responses are not supported in this browser.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          if (!raf) raf = window.requestAnimationFrame(flush);
        }
        acc += decoder.decode();
        ok = true;
      } catch (err) {
        if (controller.signal.aborted) {
          // Keep the partial answer and mark it stopped.
          useChatStore
            .getState()
            .patchMessage(convId, assistantId, { content: acc ? `${acc} ⏹` : "⏹ Stopped." });
        } else {
          const message = err instanceof Error && err.message ? err.message : "Something went wrong.";
          useChatStore
            .getState()
            .patchMessage(convId, assistantId, { failed: true, content: message });
        }
      } finally {
        if (raf) window.cancelAnimationFrame(raf);
        abortRef.current = null;
        const final = useChatStore.getState();
        final.setStreaming(false);
        if (ok) {
          final.patchMessage(
            convId,
            assistantId,
            acc.trim()
              ? { content: acc, failed: false, blocks: extractBlocks(acc) }
              : { failed: true, content: "The model returned an empty response." }
          );
        }
      }
    },
    []
  );

  const [activities, setActivities] = useState<string[]>([]);
  const [agentActive, setAgentActive] = useState(false);
  /** Live tool-result rows, typewriter-rendered token by token. */
  const [toolRuns, setToolRuns] = useState<
    { id: string; tool: string; text: string; done: boolean; ok: boolean }[]
  >([]);
  /** Inbound chunk queues per tool-call id, drained by the typewriter ticker. */
  const toolQueues = useRef(new Map<string, string[]>());
  const toolDoneFlags = useRef(new Map<string, boolean>());
  const [pendingConfirm, setPendingConfirm] = useState<{
    summary: string;
    tool: string;
    convId: string;
    assistantId: string;
  } | null>(null);

  const pushActivity = useCallback((line: string) => {
    setActivities((prev) => [...prev.slice(-29), line]);
  }, []);

  // Typewriter ticker: drains queued tool-result chunks a few characters at
  // a time so long outputs visibly stream instead of popping in whole.
  useEffect(() => {
    if (!toolRuns.some((r) => !r.done)) return;
    const t = window.setInterval(() => {
      setToolRuns((prev) =>
        prev.map((r) => {
          if (r.done) return r;
          const q = toolQueues.current.get(r.id);
          if (!q || q.length === 0) {
            if (toolDoneFlags.current.get(r.id)) {
              toolQueues.current.delete(r.id);
              toolDoneFlags.current.delete(r.id);
              return { ...r, done: true };
            }
            return r;
          }
          let take = "";
          while (take.length < 9 && q.length > 0) take += q.shift() ?? "";
          return { ...r, text: (r.text + take).slice(0, 4000) };
        })
      );
    }, 40);
    return () => window.clearInterval(t);
  }, [toolRuns]);

  /**
   * Agent loop client: POST /api/agent/run (SSE: activity/delta/needsConfirm/
   * done/error). Reads run freely; world-changing tools stop at needsConfirm
   * and only execute after the user confirms (server enforces via ctx).
   */
  const runAgent = useCallback(
    async (convId: string, assistantId: string, history: ApiMessage[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const endpoint = endpointCredentials();
      if (!endpoint) {
        useChatStore.getState().patchMessage(convId, assistantId, {
          failed: true,
          content: "Add your provider key in Settings → Endpoint, then retry.",
        });
        return;
      }
      const store = () => window.localStorage;
      let acc = "";
      useChatStore.getState().setStreaming(true);
      setAgentActive(true);
      setActivities([]);
      setToolRuns([]);
      toolQueues.current.clear();
      toolDoneFlags.current.clear();
      setPinned(true);
      setPendingConfirm(null);
      try {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            ...endpoint,
            githubToken: store().getItem("maxxen_github_token") || undefined,
            vercelToken: store().getItem("maxxen_vercel_token") || undefined,
            composioKey: store().getItem("maxxen_composio_key") || undefined,
            userEmail: useAuthStore.getState().session?.email || undefined,
            composioUserId: store().getItem("maxxen_composio_user_id") || undefined,
            memory: readMemoryCacheSafe(convId),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let message = `Agent failed with status ${res.status}.`;
          try {
            const data = (await res.json()) as { error?: unknown };
            if (typeof data?.error === "string" && data.error.trim()) message = data.error;
          } catch {
            /* body was not JSON */
          }
          throw new Error(message);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let ev: {
              activity?: { phase?: string; text?: string };
              delta?: string;
              needsConfirm?: boolean;
              summary?: string;
              tool?: string;
              toolStart?: { id?: string; tool?: string };
              toolDelta?: { id?: string; tool?: string; chunk?: string };
              toolDone?: { id?: string; tool?: string; ok?: boolean };
              toolResult?: { id?: string; tool?: string; data?: unknown };
              done?: boolean;
              error?: string;
            } | null = null;
            try {
              ev = JSON.parse(line.slice(5));
            } catch {
              continue;
            }
            if (!ev) continue;
            if (ev.error) throw new Error(ev.error);
            if (ev.activity) {
              const mark =
                ev.activity.phase === "error" ? "✗ " : ev.activity.phase === "planning" ? "◌ " : "✓ ";
              pushActivity(`${mark}${ev.activity.text ?? ""}`);
            }
            if (ev.needsConfirm) {
              setPendingConfirm({
                summary: String(ev.summary || "this action"),
                tool: String(ev.tool || "tool"),
                convId,
                assistantId,
              });
            }
            if (ev.toolStart && typeof ev.toolStart.id === "string") {
              const id = ev.toolStart.id;
              const tool = String(ev.toolStart.tool || "tool");
              toolQueues.current.set(id, []);
              setToolRuns((prev) =>
                prev.some((r) => r.id === id) ? prev : [...prev.slice(-5), { id, tool, text: "", done: false, ok: true }]
              );
            }
            if (ev.toolDelta && typeof ev.toolDelta.id === "string" && typeof ev.toolDelta.chunk === "string") {
              const q = toolQueues.current.get(ev.toolDelta.id);
              if (q) q.push(ev.toolDelta.chunk);
              else toolQueues.current.set(ev.toolDelta.id, [ev.toolDelta.chunk]);
            }
            if (ev.toolDone && typeof ev.toolDone.id === "string") {
              toolDoneFlags.current.set(ev.toolDone.id, true);
              const ok = ev.toolDone.ok !== false;
              setToolRuns((prev) => prev.map((r) => (r.id === ev.toolDone?.id ? { ...r, ok } : r)));
            }
            if (ev.toolResult && ev.toolResult.tool === "vercel_deploy") {
              const data = ev.toolResult.data as { id?: unknown; url?: unknown } | null;
              if (data && typeof data.id === "string" && data.id) {
                const { addWatch } = await import("@/lib/notify-watch").catch(() => ({ addWatch: null as never }));
                if (typeof addWatch === "function") {
                  addWatch(
                    data.id,
                    typeof data.url === "string" && data.url ? `https://${data.url}` : "",
                    window.localStorage.getItem("maxxen_vercel_project") || "maxxen"
                  );
                }
              }
            }
            if (typeof ev.delta === "string" && ev.delta) {
              acc += ev.delta;
              const snap = acc;
              useChatStore.getState().patchMessage(convId, assistantId, { content: snap });
            }
            if (ev.done) {
              useChatStore.getState().patchMessage(
                convId,
                assistantId,
                acc.trim()
                  ? { content: acc, failed: false, blocks: extractBlocks(acc) }
                  : { failed: true, content: "The agent returned an empty response." }
              );
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          useChatStore
            .getState()
            .patchMessage(convId, assistantId, { content: acc ? `${acc} ⏹` : "⏹ Stopped." });
        } else {
          const message = err instanceof Error && err.message ? err.message : "Agent failed.";
          useChatStore.getState().patchMessage(convId, assistantId, { failed: true, content: message });
        }
      } finally {
        abortRef.current = null;
        useChatStore.getState().setStreaming(false);
        setAgentActive(false);
      }
    },
    [pushActivity]
  );

  /** User confirmed a pending dangerous action — resend as an explicit human gesture. */
  const confirmPending = useCallback(async () => {
    const pending = pendingConfirm;
    if (!pending || agentActive) return;
    setPendingConfirm(null);
    setActivities([]);
    const snapshot = useChatStore.getState();
    const conv = snapshot.conversations.find((c) => c.id === pending.convId);
    if (!conv) return;
    const userText = `Confirmed: proceed with exactly this action and nothing else:\n${pending.summary}`;
    snapshot.appendMessage(pending.convId, {
      id: uid(),
      role: "user",
      content: userText,
      createdAt: Date.now(),
    });
    const after = useChatStore.getState();
    const fresh = after.conversations.find((c) => c.id === pending.convId);
    const history = toApiHistory(fresh ? fresh.messages : []);
    const nextAssistantId = uid();
    after.appendMessage(pending.convId, {
      id: nextAssistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      mode: "agent",
    });
    await runAgent(pending.convId, nextAssistantId, history);
  }, [pendingConfirm, agentActive, runAgent]);

  const declinePending = useCallback(() => {
    const pending = pendingConfirm;
    if (!pending) return;
    setPendingConfirm(null);
    useChatStore
      .getState()
      .patchMessage(pending.convId, pending.assistantId, {
        content: "Declined — nothing was executed. Tell me how to proceed instead.",
      });
  }, [pendingConfirm]);

  /** Appends the user turn (naming the chat if it's the first) and streams a reply. */
  const sendMessage = useCallback(
    async (raw: string, modeOverride?: ChatMode) => {
      const text = raw.trim();
      if (!text) return;
      const snapshot = useChatStore.getState();
      if (snapshot.streaming || abortRef.current) return;
      const requestMode: ChatMode = modeOverride ?? mode;

      // Resolve or create the target conversation.
      let convId = snapshot.activeId;
      const exists = convId ? snapshot.conversations.some((c) => c.id === convId) : false;
      if (!exists) convId = snapshot.newChat();
      if (!convId) return;

      const stateNow = useChatStore.getState();
      const current = stateNow.conversations.find((c) => c.id === convId);
      const isFirstUserMessage = !current || !current.messages.some((m) => m.role === "user");
      if (isFirstUserMessage) stateNow.renameChat(convId, text.slice(0, 42));

      stateNow.appendMessage(convId, {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      });

      // History includes the just-appended user message (before the assistant placeholder).
      const afterUser = useChatStore.getState();
      const fresh = afterUser.conversations.find((c) => c.id === convId);
      const history = toApiHistory(fresh ? fresh.messages : []);

      const assistantId = uid();
      afterUser.appendMessage(convId, {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        mode: requestMode,
      });

      if (requestMode === "agent") {
        await runAgent(convId, assistantId, history);
      } else {
        await runCompletion(convId, assistantId, history, requestMode);
      }
    },
    [runCompletion, runAgent, mode]
  );
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  /** Re-runs a failed assistant turn in place (keeps the same message id). */
  const retryMessage = useCallback(
    async (assistantMsg: Message) => {
      const snapshot = useChatStore.getState();
      if (snapshot.streaming || abortRef.current) return;
      const conv = snapshot.conversations.find((c) =>
        c.messages.some((m) => m.id === assistantMsg.id)
      );
      if (!conv) return;
      const idx = conv.messages.findIndex((m) => m.id === assistantMsg.id);
      if (idx < 0) return;
      const history = toApiHistory(conv.messages.slice(0, idx));
      const retryMode = assistantMsg.mode ?? mode;
      snapshot.patchMessage(conv.id, assistantMsg.id, { failed: false, content: "", mode: retryMode });
      if (retryMode === "agent") {
        await runAgent(conv.id, assistantMsg.id, history);
      } else {
        await runCompletion(conv.id, assistantMsg.id, history, retryMode);
      }
    },
    [runCompletion, runAgent, mode]
  );

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const streamingId =
    streaming && lastMessage && lastMessage.role === "assistant" && !lastMessage.failed
      ? lastMessage.id
      : null;

  /** The active conversation's title — the header's primary text once a thread exists. */
  const headerTitle = activeConversation && messages.length > 0 ? activeConversation.title : null;

  // Pre-hydration / pre-auth: static black shell — no store data, no mismatch risk.
  if (!mounted || !authChecked) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background" role="status" aria-label="Loading workspace">
        <ChromeLogo size={40} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Pane 1 — desktop rail */}
      <Sidebar className="hidden lg:flex" />

      {/* Pane 2 — center column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"
        />

        {/* Header — [menu][logo] | divider | title | status chip …… [count][pane][github] */}
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open conversations"
              className="mx-focus -ml-1 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <ChromeLogo size={22} />
          </div>
          <span aria-hidden="true" className="hidden h-4 w-px shrink-0 bg-white/10 sm:block" />
          {headerTitle && (
            <h1 className="min-w-0 truncate text-[13px] font-medium text-white/90">{headerTitle}</h1>
          )}
          {/* Honest status chip — replaces the static model + display-only provider chips */}
          <span className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
            <span aria-hidden="true" className="bg-glint animate-glint h-1.5 w-1.5 rounded-full" />
            <span className="font-mono text-[11px] text-white/80">{streaming ? "streaming" : "online"}</span>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <NotificationsBell />
            {messages.length > 0 && (
              <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
                {messages.length} {messages.length === 1 ? "message" : "messages"}
              </span>
            )}
            {blocks.length > 0 && (
              <button
                type="button"
                onClick={() => setPaneOpen(true)}
                aria-label="Open artifact workspace"
                className="mx-focus mx-press -mr-1 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white xl:hidden"
              >
                <PanelRight size={18} aria-hidden="true" />
              </button>
            )}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="MAXXEN on GitHub"
              className="mx-focus rounded-lg p-2 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <Github size={16} aria-hidden="true" />
            </a>
          </div>
        </header>

        {/* Thread */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="mx-scroll-thin relative flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pt-10 pb-6">
            {messages.length === 0 ? (
              <EmptyState onPick={sendMessage} />
            ) : (
              <div className="flex flex-col gap-8">
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    streaming={m.id === streamingId}
                    onRetry={retryMessage}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Jump to latest (visible when the user scrolled up) */}
        <AnimatePresence>
          {!pinned && messages.length > 0 && (
            <motion.button
              type="button"
              onClick={jumpToLatest}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="absolute bottom-28 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/80 py-1.5 pl-3 pr-2.5 font-mono text-[11px] text-white/80 shadow-lg backdrop-blur transition-colors hover:text-white"
            >
              Jump to latest
              <ArrowDown size={12} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Composer */}
        <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          <div className="mx-auto max-w-3xl">
            {pendingConfirm && (
              <div
                role="alertdialog"
                aria-label={`Confirm ${pendingConfirm.tool}`}
                className="mb-2.5 rounded-xl border border-amber-200/25 bg-amber-100/[0.05] p-3.5"
              >
                <p className="text-[13px] font-medium text-white">
                  Agent requests approval
                  <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/40">
                    {pendingConfirm.tool}
                  </span>
                </p>
                <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-white/65">
                  {pendingConfirm.summary}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={confirmPending}
                    className="mx-focus mx-press inline-flex h-8 items-center rounded-lg bg-white px-3.5 text-xs font-semibold text-black transition-colors hover:bg-white/90"
                  >
                    Confirm →
                  </button>
                  <button
                    type="button"
                    onClick={declinePending}
                    className="mx-focus mx-press inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.08]"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
            {(agentActive || activities.length > 0 || toolRuns.length > 0) && (
              <div
                aria-live="polite"
                aria-label="Agent activity"
                className="mb-2.5 grid max-h-48 gap-1 overflow-auto rounded-xl border border-white/[0.07] bg-black/50 p-3 font-mono text-[11px] leading-relaxed"
              >
                {activities.slice(-8).map((a, i) => (
                  <div
                    key={`${i}-${a.slice(0, 24)}`}
                    className={
                      a.startsWith("✗")
                        ? "text-red-200/80"
                        : a.startsWith("◌")
                          ? "text-white/50"
                          : "text-white/70"
                    }
                  >
                    {a}
                  </div>
                ))}
                {toolRuns.slice(-4).map((r) => (
                  <div key={r.id} className={r.ok ? "text-white/75" : "text-red-200/80"}>
                    <span className="text-white/40">[{r.tool}] </span>
                    {r.text}
                    {!r.done && (
                      <span aria-hidden="true" className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-white/80" />
                    )}
                  </div>
                ))}
                {agentActive && <div className="text-white/50">◌ working…</div>}
              </div>
            )}
            <Composer
              streaming={streaming}
              mode={mode}
              onModeChange={setMode}
              onSend={sendMessage}
              onStop={stopGenerating}
            />
            <div className="mt-2 flex items-center gap-1.5 px-1">
              <Lock size={10} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
              <p className="truncate font-mono text-[10px] text-muted-foreground/80">
                Your keys never leave your browser.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pane 3 — docked workspace, only while artifacts exist (no empty void at xl+) */}
      {blocks.length > 0 && <WorkspacePane blocks={blocks} versions={threadVersions} streaming={streaming} convId={activeId} />}

      {/* Mobile slide-over */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              onClick={closeMobile}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label="Conversations"
              initial={{ x: reduceMotion ? 0 : -320, opacity: reduceMotion ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduceMotion ? 0 : -320, opacity: 0 }}
              transition={{ type: "tween", duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <Sidebar onNavigate={closeMobile} className="bg-black/95" />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Workspace overlay (below xl, only when artifacts exist) */}
      <AnimatePresence>
        {paneOpen && (
          <>
            <motion.div
              key="pane-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              onClick={closePane}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm xl:hidden"
              aria-hidden="true"
            />
            <motion.aside
              key="pane-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Artifact workspace"
              initial={{ x: reduceMotion ? 0 : 420, opacity: reduceMotion ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduceMotion ? 0 : 420, opacity: 0 }}
              transition={{ type: "tween", duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              className="fixed inset-y-0 right-0 z-50 xl:hidden"
            >
              <WorkspacePane
                blocks={blocks}
                versions={threadVersions}
                streaming={streaming}
                convId={activeId}
                onClose={closePane}
                className="flex h-full w-[min(92vw,420px)] border-l bg-black/95 backdrop-blur-xl xl:hidden"
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
