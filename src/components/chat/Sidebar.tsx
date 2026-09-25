"use client";

import { memo, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, KeyRound, LogOut, MessageSquareDashed, Plus, Settings2, Trash2 } from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { useChatStore, type Conversation } from "./store";

/** "Just now" / "2m ago" / "3h ago" / locale date — mirrors the real app's timeAgo. */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Time bucket labels for the conversation list, in display order. */
const GROUP_LABELS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;

const subscribeNever = () => () => {};
/** True only on the client after hydration — safe gate for persisted state. */
function useMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/** Buckets a timestamp into one of the four group labels. */
function bucketOf(timestamp: number): (typeof GROUP_LABELS)[number] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfToday) return "Today";
  if (timestamp >= startOfToday - 86_400_000) return "Yesterday";
  if (timestamp >= startOfToday - 7 * 86_400_000) return "Previous 7 days";
  return "Older";
}

export interface SidebarProps {
  /** Invoked after picking/creating a conversation (closes the mobile slide-over). */
  onNavigate?: () => void;
  /** Extra classes (desktop rail uses "hidden lg:flex"; overlay overrides the bg). */
  className?: string;
}

const GITHUB_URL = "https://github.com/xmanya26911-bit/maxxen-ai";

/**
 * Sidebar — brand block, white New chat button, time-grouped conversation
 * list with hover-delete and glint active rail, then footer links + BYOK chip.
 */
function SidebarImpl({ onNavigate, className }: SidebarProps) {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const setActive = useChatStore((s) => s.setActive);
  const deleteChat = useChatStore((s) => s.deleteChat);

  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  // Gated on mount so the persisted session never fights SSR hydration.
  const mounted = useMounted();

  /** Newest-first list grouped into the four time buckets (empty groups skipped). */
  const groups = useMemo(() => {
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    return GROUP_LABELS.map((label) => ({
      label,
      items: sorted.filter((c) => bucketOf(c.updatedAt) === label),
    })).filter((g) => g.items.length > 0);
  }, [conversations]);

  const handleNewChat = () => {
    const { conversations: current, activeId: currentId, newChat } = useChatStore.getState();
    const active = current.find((c) => c.id === currentId);
    // Reuse an already-empty active chat instead of piling up blank threads.
    if (!active || active.messages.length > 0) newChat();
    onNavigate?.();
  };

  const renderConversation = (conv: Conversation) => {
    const active = conv.id === activeId;
    return (
      <li
        key={conv.id}
        className={cn(
          "group relative flex items-center rounded-lg border-l-2 transition-colors",
          active ? "border-glint bg-white/[0.06]" : "border-transparent hover:bg-white/[0.04]"
        )}
      >
        <button
          type="button"
          onClick={() => {
            setActive(conv.id);
            onNavigate?.();
          }}
          title={conv.title}
          aria-current={active ? "true" : undefined}
          className="mx-focus min-w-0 flex-1 cursor-pointer px-3 py-2 text-left"
        >
          <span className={cn("block truncate text-[13px]", active ? "text-white" : "text-white/75")}>
            {conv.title}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
            {timeAgo(conv.updatedAt)}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deleteChat(conv.id);
          }}
          aria-label={`Delete conversation: ${conv.title}`}
          className="mx-focus mx-press mr-1.5 shrink-0 rounded-md p-2 text-muted-foreground opacity-100 transition-all hover:bg-white/[0.08] hover:text-white lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <aside
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-black/40 backdrop-blur-xl",
        className
      )}
    >
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <ChromeLogo size={26} />
        <div className="text-chrome min-w-0 text-[13px] font-semibold tracking-[0.22em]">MAXXEN</div>
        <span className="ml-auto shrink-0 rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
          workspace
        </span>
      </div>

      {/* New chat */}
      <div className="px-3 pb-1 pt-3">
        <motion.button
          type="button"
          onClick={handleNewChat}
          whileTap={{ scale: 0.98 }}
          className="mx-focus flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-medium text-black transition-colors hover:bg-white/90 hover:shadow-[0_0_24px_-6px_rgba(255,255,255,0.35)]"
        >
          <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
          New chat
        </motion.button>
      </div>

      {/* Conversations — grouped by recency */}
      <nav
        aria-label="Conversations"
        className="mx-scroll-thin flex-1 overflow-y-auto px-2 pb-2"
      >
        {groups.length === 0 ? (
          <div className="mx-1 mt-3 rounded-xl border border-dashed border-white/10 px-3 py-5 text-center">
            <MessageSquareDashed size={16} className="mx-auto text-white/30" aria-hidden="true" />
            <p className="mt-2 text-xs text-white/60">No conversations yet</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">
              Start a new chat and it will show up here.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <p className="px-3 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
                {group.label}
              </p>
              <ul className="space-y-0.5">{group.items.map(renderConversation)}</ul>
            </div>
          ))
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-3">
        {mounted && session && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            <span
              aria-hidden="true"
              className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[10px] font-medium text-white/80"
            >
              {session.email.charAt(0).toUpperCase()}
              <span className="bg-glint absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/70" title={session.email}>
              {session.email}
            </span>
            <button
              type="button"
              onClick={signOut}
              aria-label={`Sign out ${session.email}`}
              className="mx-focus mx-press shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <LogOut size={12} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="mx-focus inline-flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-white"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Back to site
          </Link>
          <Link
            href="/settings"
            className="mx-focus inline-flex items-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-white"
            aria-label="Workspace settings"
          >
            <Settings2 size={12} aria-hidden="true" />
            Settings
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-focus ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-white"
          >
            GitHub
            <ArrowUpRight size={11} aria-hidden="true" />
          </a>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
          <KeyRound size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            BYOK · keys stay in your browser
          </span>
          <span aria-hidden="true" className="bg-glint animate-glint ml-auto h-1 w-1 shrink-0 rounded-full" />
        </div>
      </div>
    </aside>
  );
}

const Sidebar = memo(SidebarImpl);
export default Sidebar;
