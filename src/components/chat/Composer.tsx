"use client";

import { memo, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { CHAT_MODES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ChatMode } from "./types";

/** Max textarea height ≈ 6 rows before it starts scrolling internally. */
const MAX_HEIGHT = 168;

export interface ComposerProps {
  /** When true the send button becomes a Stop button. */
  streaming: boolean;
  /** Currently selected chat mode (drives the chips row). */
  mode: ChatMode;
  /** Selects a chat mode chip. */
  onModeChange: (mode: ChatMode) => void;
  /** Sends the message together with the selected mode. */
  onSend: (text: string, mode: ChatMode) => void;
  onStop: () => void;
}

/**
 * Composer — liquid-glass input shell (border + glow on focus-within) with a
 * scrollable mode chips toolbar (+ quiet Shift/Enter hint), an auto-resizing
 * textarea (1→6 rows), Enter=send / Shift+Enter=newline, and a white
 * circular Send that turns into a Stop control while streaming.
 */
function ComposerImpl({ streaming, mode, onModeChange, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize: reset to content height, capped at MAX_HEIGHT.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !streaming;

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    onSend(text, mode);
    setValue(""); // the resize effect snaps the textarea back to one row
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.1] transition-[border-color,box-shadow] duration-200 focus-within:border-white/20 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_8px_40px_-12px_rgba(255,255,255,0.08)]">
      <div className="liquid-glass rounded-2xl p-2">
        {/* Toolbar: scrollable mode chips + fixed keyboard hint */}
        <div className="flex items-center gap-2 pl-2 pr-1 pt-0.5">
          <div
            role="toolbar"
            aria-label="Chat modes"
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CHAT_MODES.map((m) => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  aria-pressed={active}
                  onClick={() => onModeChange(m.id)}
                  className={cn(
                    "mx-focus mx-press shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "border-white bg-white text-black"
                      : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          {/* Real hint, not filler — mirrors the textarea's actual behavior */}
          <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
            <kbd className="mx-kbd">Shift</kbd>
            <span className="text-[10px] text-white/30">+</span>
            <kbd className="mx-kbd">↵</kbd>
            <span className="ml-1 text-[10px] text-white/30">newline</span>
          </span>
        </div>
        {/* Text row */}
        <div className="flex items-end gap-2 pl-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask MAXXEN to build anything…"
            aria-label="Message MAXXEN"
            className="min-h-[24px] w-full flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-white outline-none placeholder:text-muted-foreground"
            style={{ maxHeight: MAX_HEIGHT, overflowY: "auto" }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="mx-focus mx-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <Square size={12} className="animate-pulse fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="mx-focus mx-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_0_0_rgba(255,255,255,0)] transition-all hover:bg-white/90 hover:shadow-[0_0_20px_-4px_rgba(255,255,255,0.45)] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none disabled:hover:bg-white"
            >
              <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Composer = memo(ComposerImpl);
export default Composer;
