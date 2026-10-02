/**
 * Chat synchronization — local-first conversations backed by the user's own
 * `maxxen-data` repo (`chats/<id>.json` + `chats/_index.json`).
 *
 * Rules: localStorage stays the instant source of truth; the repo is the
 * durable backup + cross-device copy. Writes are debounced and best-effort
 * (chat never fails on sync). Deletes remove both the file and the index
 * entry — no stale copies where Maxxen controls the data.
 * Isomorphic + dependency-free (same shapes used by the hook and tests).
 */

import type { Source } from "./citations";
import { MAX_SYNC_TEXT_BYTES } from "./attachments";

export const CHATS_DIR = "chats";
export const CHAT_INDEX_PATH = "chats/_index.json";
export const MAX_SYNCED_MESSAGES = 120;
export const MAX_SYNCED_CONTENT_CHARS = 12_000;

export interface SyncedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "text";
  text: string;
  truncated?: boolean;
}

export interface SyncedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  failed?: boolean;
  attachments?: SyncedAttachment[];
}

export interface ConversationFile {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: SyncedMessage[];
}

export interface ConversationIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

export function chatFilePath(id: string): string {
  return `${CHATS_DIR}/${id}.json`;
}

/** Only chat files + the index may ever be deleted through the delete route. */
export function isDeletableChatPath(path: unknown): boolean {
  return typeof path === "string" && /^(chats\/[A-Za-z0-9_-]+\.json|chats\/_index\.json)$/.test(path);
}

/** Strip non-persisted fields (blocks re-derive, mode implied) + enforce caps. */
export function toConversationFile(conv: {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: { id: string; role: string; content: string; createdAt?: number; failed?: boolean; sources?: unknown }[],
}): ConversationFile {
  const messages: SyncedMessage[] = [];
  for (const m of conv.messages.slice(-MAX_SYNCED_MESSAGES)) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const sources = Array.isArray((m as { sources?: unknown }).sources)
      ? ((m as { sources?: unknown }).sources as unknown[])
          .map((s) => {
            if (!s || typeof s !== "object") return null;
            const o = s as Record<string, unknown>;
            if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.url !== "string") return null;
            const out: Source = {
              id: o.id.slice(0, 32),
              title: o.title.slice(0, 200),
              url: o.url.slice(0, 500),
              kind: o.kind === "page" ? "page" : "snippet",
            };
            if (typeof o.domain === "string") out.domain = o.domain.slice(0, 120);
            if (typeof o.snippet === "string") out.snippet = o.snippet.slice(0, 400);
            if (typeof o.publishedAt === "string") out.publishedAt = o.publishedAt.slice(0, 40);
            return out;
          })
          .filter((s): s is Source => s !== null)
          .slice(0, 10)
      : [];
    const rawAttachments = (m as { attachments?: unknown }).attachments;
    const attachments = Array.isArray(rawAttachments)
      ? rawAttachments.map((a) => {
          if (!a || typeof a !== "object") return null;
          const o = a as Record<string, unknown>;
          if (o.kind !== "text" || typeof o.text !== "string") return null;
          return {
            id: typeof o.id === "string" ? o.id.slice(0, 64) : `att_${Date.now().toString(36)}`,
            name: typeof o.name === "string" ? o.name.slice(0, 120) : "file",
            mimeType: typeof o.mimeType === "string" ? o.mimeType.slice(0, 120) : "text/plain",
            size: typeof o.size === "number" && Number.isFinite(o.size) ? o.size : 0,
            kind: "text" as const,
            text: o.text.slice(0, MAX_SYNC_TEXT_BYTES),
            ...(o.truncated || o.text.length > MAX_SYNC_TEXT_BYTES ? { truncated: true } : {}),
          };
        }).filter((x): x is SyncedAttachment => x !== null).slice(0, 5)
      : [];
    messages.push({
      id: String(m.id),
      role: m.role,
      content: m.content.slice(0, MAX_SYNCED_CONTENT_CHARS),
      createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
      ...(m.failed ? { failed: true } : {}),
      ...(sources.length ? { sources } : {}),
      ...(attachments.length ? { attachments } : {}),
    });
  }
  return {
    id: String(conv.id),
    title: String(conv.title ?? "Untitled").slice(0, 140),
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages,
  };
}

export function indexEntryFor(file: ConversationFile): ConversationIndexEntry {
  return { id: file.id, title: file.title, updatedAt: file.updatedAt, messageCount: file.messages.length };
}

/** Merge a fresh entry into an index (newest data wins per id). */
export function mergeIndexEntry(index: ConversationIndexEntry[], entry: ConversationIndexEntry): ConversationIndexEntry[] {
  const rest = index.filter((e) => e.id !== entry.id);
  return [...rest, entry].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeIndexEntry(index: ConversationIndexEntry[], id: string): ConversationIndexEntry[] {
  return index.filter((e) => e.id !== id);
}

/** Fast local search over titles + loaded message content (no downloads). */
export function searchConversations<
  T extends { id: string; title: string; messages?: { content: string }[] },
>(convs: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return convs;
  return convs.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      (c.messages ?? []).some((m) => typeof m.content === "string" && m.content.toLowerCase().includes(q))
  );
}
