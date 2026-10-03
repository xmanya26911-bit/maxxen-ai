"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "./store";
import type { Source } from "@/lib/citations";
import type { Attachment } from "@/lib/attachments";
import { useAuthStore } from "@/lib/auth-store";
import {
  CHAT_INDEX_PATH,
  chatFilePath,
  indexEntryFor,
  mergeIndexEntry,
  removeIndexEntry,
  toConversationFile,
  type ConversationIndexEntry,
} from "@/lib/chat-sync";

async function postJSON(path: string, body: unknown): Promise<any> {
  const session = useAuthStore.getState().session?.token || "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["x-maxxen-session"] = session;
  const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}

function token(): string | null {
  try {
    return window.localStorage.getItem("maxxen_github_token")?.trim() || null;
  } catch {
    return null;
  }
}

function parseIndex(text: unknown): ConversationIndexEntry[] {
  if (typeof text !== "string" || !text) return [];
  try {
    const j = JSON.parse(text);
    if (!Array.isArray(j)) return [];
    return j
      .filter((e) => e && typeof e.id === "string")
      .map((e: { id: string; title?: unknown; updatedAt?: unknown; messageCount?: unknown }) => ({
        id: String(e.id),
        title: String(e.title ?? "Untitled").slice(0, 140),
        updatedAt: Number(e.updatedAt) || 0,
        messageCount: Number(e.messageCount) || 0,
      }));
  } catch {
    return [];
  }
}

/** Persist one conversation + refresh the index (best-effort, never throws). */
export async function persistConversation(id: string): Promise<void> {
  try {
    const t = token();
    const conv = useChatStore.getState().conversations.find((c) => c.id === id);
    if (!conv || !conv.messages.length) return;
    if (!t && !useAuthStore.getState().session?.token) return;
    const file = toConversationFile(conv);
    const saved = await postJSON("/api/github/save", {
      
      path: chatFilePath(id),
      content: file,
      message: `maxxen: sync chat ${file.title.slice(0, 60)}`,
    });
    if (!saved?.ok) return;
    const idx = await postJSON("/api/github/file", { path: CHAT_INDEX_PATH });
    const entries = parseIndex(typeof idx?.text === "string" ? idx.text : "");
    const next = mergeIndexEntry(entries, indexEntryFor(file));
    await postJSON("/api/github/save", { path: CHAT_INDEX_PATH, content: next, message: "maxxen: sync chat index" });
  } catch {
    /* offline — local copy remains truth */
  }
}

/** Delete the remote file + index entry (local delete happens in the store first). */
export async function syncDeleteConv(id: string): Promise<void> {
  try {
    const t = token();
    if (!t && !useAuthStore.getState().session?.token) return;
    await postJSON("/api/github/delete", { path: chatFilePath(id) });
    const idx = await postJSON("/api/github/file", { path: CHAT_INDEX_PATH });
    const entries = parseIndex(typeof idx?.text === "string" ? idx.text : "");
    const next = removeIndexEntry(entries, id);
    if (next.length !== entries.length) {
      await postJSON("/api/github/save", { path: CHAT_INDEX_PATH, content: next, message: "maxxen: sync chat index" });
    }
  } catch {
    /* ignore */
  }
}

/** Rename persists through the normal write path (index refreshes on write). */
export async function syncRenameConv(id: string): Promise<void> {
  await persistConversation(id);
}

/**
 * Chat sync hook: call once in ChatShell. Loads the remote index on mount
 * (stubs for unknown conversations, lazy full load on open), persists the
 * active thread when streaming stops + every 30s while dirty.
 */
export function useChatSync(): void {
  const activeId = useChatStore((s) => s.activeId);
  const streaming = useChatStore((s) => s.streaming);
  const loadedRef = useRef(false);
  const syncedRef = useRef(new Map<string, number>());
  const prevStreamingRef = useRef(streaming);

  // Initial index load → stubs for cross-device conversations.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
            const t = token();
        const session = useAuthStore.getState().session?.token || "";
        if (!session) return;

        // OAuth/PAT credentials are stored in the HttpOnly account cookie.
        // Only migrate a legacy localStorage token when the account is not
        // already connected. This prevents an old token from overwriting a
        // freshly authorized OAuth credential.
        if (t) {
          const status = await fetch("/api/account/github", {
            method: "GET",
            headers: { "x-maxxen-session": session },
          }).then((r) => r.json().catch(() => ({})));
          if (!status?.connected) {
            await postJSON("/api/account/github", { githubToken: t });
          }
        }
        const idx = await postJSON("/api/github/file", { path: CHAT_INDEX_PATH });
        const entries = parseIndex(typeof idx?.text === "string" ? idx.text : "");
        if (!entries.length) return;
        const state = useChatStore.getState();
        const localById = new Map(state.conversations.map((c) => [c.id, c]));
        // The remote index is the cross-device catalog. Keep local-only chats,
        // but never let an older local snapshot hide a newer cloud snapshot.
        for (const e of entries) {
          const local = localById.get(e.id);
          if (!local) {
            state.importConversation({
              id: e.id,
              title: e.title,
              createdAt: e.updatedAt,
              updatedAt: e.updatedAt,
              messages: [],
            });
            continue;
          }
          if (e.updatedAt > local.updatedAt) {
            // Mark it as a remote stub so the lazy loader below fetches the
            // complete conversation instead of treating stale local messages
            // as authoritative.
            state.importConversation({
              ...local,
              title: e.title,
              updatedAt: e.updatedAt,
              messages: [],
            });
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Lazy full load when opening a stub (empty locally, known remotely).
  useEffect(() => {
    if (!activeId) return;
    const conv = useChatStore.getState().conversations.find((c) => c.id === activeId);
    if (!conv) return;
    // A stub has no messages and must be hydrated from cloud. A local thread
    // with messages is already current unless the initial index marked it as
    // stale by clearing its messages.
    (async () => {
      try {
        const t = token();
        if (!t && !useAuthStore.getState().session?.token) return;
        const j = await postJSON("/api/github/file", { path: chatFilePath(activeId) });
        const raw = typeof j?.text === "string" ? j.text : "";
        const file = raw ? JSON.parse(raw) : null;
        if (file && Array.isArray(file.messages) && file.messages.length) {
          useChatStore.getState().importConversation({
            id: file.id || activeId,
            title: typeof file.title === "string" ? file.title : conv.title,
            createdAt: Number(file.createdAt) || conv.createdAt,
            updatedAt: Number(file.updatedAt) || Date.now(),
            messages: file.messages
              .filter((m: unknown) => m && typeof (m as { content?: unknown }).content === "string")
              .map((m: { id?: unknown; role?: unknown; content?: unknown; createdAt?: unknown; failed?: unknown; sources?: unknown; attachments?: unknown }) => ({
                id: String(m.id ?? `${activeId}-${Math.random().toString(36).slice(2)}`),
                role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                content: String(m.content).slice(0, 12000),
                createdAt: Number(m.createdAt) || Date.now(),
                ...(m.failed ? { failed: true } : {}),
                ...(Array.isArray(m.sources) ? { sources: m.sources.filter((x: unknown) => x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" && typeof (x as { title?: unknown }).title === "string" && typeof (x as { url?: unknown }).url === "string").slice(0, 10) as Source[] } : {}),
                ...(Array.isArray(m.attachments) ? { attachments: m.attachments.filter((a: unknown) => a && typeof a === "object" && (a as { kind?: unknown }).kind === "text" && typeof (a as { text?: unknown }).text === "string").map((a: unknown) => { const x = a as { id?: unknown; name?: unknown; mimeType?: unknown; size?: unknown; text?: unknown; truncated?: unknown }; return { id: String(x.id ?? "att_" + Math.random().toString(36).slice(2)).slice(0, 64), name: String(x.name ?? "file").slice(0, 120), mimeType: String(x.mimeType ?? "text/plain").slice(0, 120), size: Number(x.size) || 0, kind: "text" as const, text: String(x.text).slice(0, 50000), ...(x.truncated ? { truncated: true } : {}) }; }).slice(0, 5) as Attachment[] } : {}),
              })),
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [activeId]);

  // Persist when a run finishes.
  useEffect(() => {
    const was = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    if (was && !streaming && activeId) {
      const conv = useChatStore.getState().conversations.find((c) => c.id === activeId);
      const last = syncedRef.current.get(activeId) ?? 0;
      if (conv && conv.updatedAt > last && conv.messages.length) {
        syncedRef.current.set(activeId, conv.updatedAt);
        void persistConversation(activeId);
      }
    }
  }, [streaming, activeId]);

  // Safety net: persist a dirty active thread every 30s (paused while streaming).
  useEffect(() => {
    const timer = setInterval(() => {
      const id = useChatStore.getState().activeId;
      if (!id || useChatStore.getState().streaming) return;
      const conv = useChatStore.getState().conversations.find((c) => c.id === id);
      const last = syncedRef.current.get(id) ?? 0;
      if (conv && conv.updatedAt > last && conv.messages.length) {
        syncedRef.current.set(id, conv.updatedAt);
        void persistConversation(id);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);
}
