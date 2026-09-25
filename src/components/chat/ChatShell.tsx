"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Github, Lock, Menu, PanelRight } from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import Composer from "./Composer";
import EmptyState from "./EmptyState";
import MessageRow from "./MessageRow";
import Sidebar from "./Sidebar";
import WorkspacePane from "./WorkspacePane";
import { extractBlocks } from "./blocks";
import { uid, useChatStore } from "./store";
import { useAuthStore } from "@/lib/auth-store";
import { validateSession } from "@/lib/auth-api";
import { useRouter } from "next/navigation";
import type { ChatMode, CodeBlock, Message } from "./types";

/** BYOK endpoint keys — same localStorage keys as the MAXXEN settings hub. */
function endpointCredentials() {
  if (typeof window === "undefined") return null;
  const apiKey = window.localStorage.getItem("maxxen_apikey") || "";
  const model = window.localStorage.getItem("maxxen_model") || "";
  if (!apiKey.trim() || !model.trim()) return null;
  return {
    apiKey: apiKey.trim(),
    model: model.trim(),
    baseURL: window.localStorage.getItem("maxxen_baseurl") || "",
    provider: window.localStorage.getItem("maxxen_provider") || "custom",
  };
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

export default function ChatShell() {
  const router = useRouter();
  const mounted = useMounted();
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paneOpen, setPaneOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [pinned, setPinned] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
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

      await runCompletion(convId, assistantId, history, requestMode);
    },
    [runCompletion, mode]
  );

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
      snapshot.patchMessage(conv.id, assistantMsg.id, { failed: false, content: "", mode });
      await runCompletion(conv.id, assistantMsg.id, history, mode);
    },
    [runCompletion, mode]
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
      {blocks.length > 0 && <WorkspacePane blocks={blocks} streaming={streaming} convId={activeId} />}

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
