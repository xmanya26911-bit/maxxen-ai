import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Conversation, Message } from "./types";

export type { Conversation };

/**
 * Chat store — zustand + persist (localStorage key "maxxen-chat-v1", data v2).
 * `streaming` is transient and never persisted; conversations + activeId are.
 * Caps mirror the real MAXXEN app: at most MAX_CHATS conversations (oldest
 * dropped silently) and MAX_MSGS_PER_CHAT messages per thread (oldest
 * user/assistant pairs dropped silently).
 */

/** Maximum number of stored conversations; beyond this the oldest are dropped. */
export const MAX_CHATS = 50;
/** Maximum number of messages per conversation; beyond this oldest pairs are dropped. */
export const MAX_MSGS_PER_CHAT = 120;

/** Collision-resistant id (crypto.randomUUID with a deterministic fallback). */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  streaming: boolean;
  /** Creates an empty "New chat" conversation, makes it active, returns its id. */
  newChat: () => string;
  setActive: (id: string) => void;
  /** Deletes a conversation; if the active one is deleted, falls back to the newest. */
  deleteChat: (id: string) => void;
  /** Sets a conversation title (used to name a thread after its first user message). */
  renameChat: (convId: string, title: string) => void;
  /** Appends a message to a conversation and bumps its updatedAt (trims oldest pairs). */
  appendMessage: (convId: string, msg: Message) => void;
  /** Shallow-patches a single message (streaming content, failure flag…). */
  patchMessage: (convId: string, msgId: string, patch: Partial<Message>) => void;
  setStreaming: (streaming: boolean) => void;
  /** Wipes every conversation (localStorage is cleared on next persist write). */
  clearAll: () => void;
}

/** v1 persisted message shape — the failure flag was named `error` before v2. */
interface LegacyMessage extends Message {
  error?: boolean;
}

/** Renames the v1 `error` flag to the v2 `failed` flag on one persisted message. */
function migrateMessage(m: LegacyMessage): Message {
  if (m.error) {
    const next: Message = { ...m, failed: true };
    delete (next as LegacyMessage).error;
    return next;
  }
  return m;
}

/** Normalizes + trims a persisted message list (oldest pairs dropped). */
function migrateMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return (raw as LegacyMessage[])
    .filter(
      (m): m is LegacyMessage =>
        typeof m === "object" && m !== null && typeof m.id === "string" && typeof m.content === "string"
    )
    .slice(-MAX_MSGS_PER_CHAT)
    .map(migrateMessage);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      conversations: [],
      activeId: null,
      streaming: false,

      newChat: () => {
        const id = uid();
        const now = Date.now();
        const conversation: Conversation = {
          id,
          title: "New chat",
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        set((s) => {
          const conversations = [conversation, ...s.conversations];
          if (conversations.length <= MAX_CHATS) {
            return { conversations, activeId: id };
          }
          // Silent cap: keep the MAX_CHATS most recently updated threads.
          // The brand-new chat is newest, so it always survives.
          const kept = [...conversations]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_CHATS);
          return { conversations: kept, activeId: id };
        });
        return id;
      },

      setActive: (id) => set({ activeId: id }),

      deleteChat: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          let activeId = s.activeId;
          if (s.activeId === id) {
            const newest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            activeId = newest ? newest.id : null;
          }
          return { conversations, activeId };
        }),

      renameChat: (convId, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === convId ? { ...c, title } : c)),
        })),

      appendMessage: (convId, msg) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== convId) return c;
            let messages = [...c.messages, msg];
            // Silent cap: drop the oldest user/assistant pairs so the thread
            // keeps its turn structure intact.
            while (messages.length > MAX_MSGS_PER_CHAT) {
              messages = messages.slice(2);
            }
            return { ...c, messages, updatedAt: Date.now() };
          }),
        })),

      patchMessage: (convId, msgId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }
              : c
          ),
        })),

      setStreaming: (streaming) => set({ streaming }),

      clearAll: () => set({ conversations: [], activeId: null, streaming: false }),
    }),
    {
      name: "maxxen-chat-v1",
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // Server render: no storage. createJSONStorage catches this and disables persistence.
          throw new Error("localStorage is unavailable during SSR");
        }
        return window.localStorage;
      }),
      // Only durable fields are persisted; `streaming` is session-transient.
      partialize: (s) => ({ conversations: s.conversations, activeId: s.activeId }),
      // v1 → v2: rename `error` → `failed`, apply the caps, keep activeId valid.
      migrate: (persisted) => {
        const raw = (typeof persisted === "object" && persisted !== null ? persisted : {}) as {
          conversations?: unknown;
          activeId?: unknown;
        };
        const conversations: Conversation[] = Array.isArray(raw.conversations)
          ? (raw.conversations as Conversation[])
              .filter(
                (c): c is Conversation =>
                  typeof c === "object" && c !== null && typeof c.id === "string"
              )
              .map((c) => ({ ...c, messages: migrateMessages(c.messages) }))
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, MAX_CHATS)
          : [];
        return {
          conversations,
          activeId:
            typeof raw.activeId === "string" && conversations.some((c) => c.id === raw.activeId)
              ? raw.activeId
              : (conversations[0]?.id ?? null),
        };
      },
    }
  )
);
