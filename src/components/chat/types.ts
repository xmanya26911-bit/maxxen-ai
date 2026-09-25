/**
 * Chat domain types for the MAXXEN chat experience.
 * Shared by the zustand store, the streaming client, the row renderer
 * and the artifact workspace pane.
 */
import type { CHAT_MODES } from "@/lib/constants";

/** Chat mode ids — mirrors CHAT_MODES in src/lib/constants.ts. */
export type ChatMode = (typeof CHAT_MODES)[number]["id"];

/** One fenced code artifact extracted from an assistant message. */
export interface CodeBlock {
  /** Language token — the first word after ``` (lower-cased). */
  lang: string;
  /** Raw code body (never empty for extracted blocks). */
  code: string;
  /** Optional file path — the second fence token when it contains a dot (```tsx app/page.tsx). */
  path?: string;
}

/** A single chat message (a persisted user turn or assistant turn). */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** Marks a failed assistant turn; renders the glint error card with Retry. */
  failed?: boolean;
  /** Mode the assistant answered in ("chat" is implied and not rendered). */
  mode?: ChatMode;
  /** Code blocks cached on the message after a successful stream (real-app Message shape). */
  blocks?: CodeBlock[];
}

/** A persisted conversation thread. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}
