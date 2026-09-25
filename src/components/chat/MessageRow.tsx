"use client";

import { memo, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, RotateCcw, TriangleAlert } from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import { cn } from "@/lib/utils";
import { copyText } from "./copy";
import MarkdownLite from "./MarkdownLite";
import type { Message } from "./types";

/** "14:05" locale stamp shown on hover under each message. */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Dependency names actually imported/required by generated code. */
function extractDeps(code: string): string[] {
  const found = new Set<string>();
  const fromRe = /(?:import|export)[^'"]*?from\s*["']([^"']+)["']/g;
  const reqRe = /require\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(code))) {
    const name = m[1].split("/")[0].replace(/^@/, "@");
    if (name && !name.startsWith(".") && name.length < 60) found.add(name);
  }
  while ((m = reqRe.exec(code))) {
    const name = m[1].split("/")[0];
    if (name && !name.startsWith(".") && name.length < 60) found.add(name);
  }
  return [...found];
}

/**
 * Project analytics — computed live from THIS response's code blocks and
 * rendered at the end of the assistant message: files, lines, components,
 * API routes, dependencies. Real measurements of generated output, never
 * invented build/test numbers.
 */
function ProjectAnalytics({ blocks }: { blocks: NonNullable<Message["blocks"]> }) {
  const stats = useMemo(() => {
    let lines = 0;
    let components = 0;
    let apiRoutes = 0;
    const deps = new Set<string>();
    for (const b of blocks) {
      lines += b.code.split("\n").length;
      if (b.path && /(^|\/)api\/.+\/route\.[jt]s$/.test(b.path)) apiRoutes += 1;
      else if (["tsx", "jsx"].includes(b.lang)) {
        components += 1;
      } else if (
        ["ts", "js"].includes(b.lang) &&
        /export\s+(default\s+)?(function|const|class)\s+[A-Z]/.test(b.code)
      ) {
        components += 1;
      }
      for (const d of extractDeps(b.code)) deps.add(d);
    }
    return { files: blocks.length, lines, components, apiRoutes, deps: deps.size };
  }, [blocks]);

  const cells: [string, string][] = [
    ["Files", String(stats.files)],
    ["Lines", stats.lines.toLocaleString()],
    ["Components", String(stats.components)],
    ["API routes", String(stats.apiRoutes)],
    ["Dependencies", String(stats.deps)],
  ];
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]" aria-label="Project analytics">
      <p className="border-b border-white/[0.06] px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
        Project analytics
      </p>
      <dl className="grid grid-cols-3 gap-px sm:grid-cols-5">
        {cells.map(([label, value]) => (
          <div key={label} className="px-3 py-2">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-white/90">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface MessageRowProps {
  message: Message;
  /** True only for the assistant message currently being streamed. */
  streaming?: boolean;
  /** Re-runs the request for a failed assistant message. */
  onRetry?: (message: Message) => void;
}

/**
 * MessageRow — chrome-inverse user bubble (right) vs MAXXEN assistant row
 * (avatar + mono name + optional mode chip + MarkdownLite + streaming
 * caret / skeleton, hover copy action, glint failure card with Retry).
 */
function MessageRowImpl({ message, streaming = false, onRetry }: MessageRowProps) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const time = useMemo(() => formatTime(message.createdAt), [message.createdAt]);

  const handleCopy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  /** Shimmering placeholder shown before the first streamed chunk lands. */
  const showSkeleton = streaming && message.content.trim() === "";

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
      className={cn("group", isUser ? "flex justify-end" : "flex gap-3")}
    >
      {isUser ? (
        <div className="flex max-w-[80%] flex-col items-end">
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[15px] leading-relaxed text-black shadow-[0_10px_30px_-16px_rgba(255,255,255,0.4)]">
            {message.content}
          </div>
          <time className="mt-1.5 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {time}
          </time>
        </div>
      ) : (
        <>
          <ChromeLogo size={28} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            {/* Name row: MAXXEN + optional mode chip + hover copy action */}
            <div className="mb-1.5 flex min-h-[22px] items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">
                MAXXEN
              </span>
              {message.mode && message.mode !== "chat" && !message.failed && (
                <span className="rounded border border-white/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">
                  {message.mode}
                </span>
              )}
              {!message.failed && message.content.trim() !== "" && (
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy message"
                  className="mx-focus mx-press ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  {copied ? <Check size={13} className="text-glint" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                </button>
              )}
            </div>

            {message.failed ? (
              <div className="rounded-xl border border-[hsl(var(--glint)/0.35)] bg-[hsl(var(--glint)/0.05)] px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0 text-glint" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-white/90">Generation failed</p>
                    <p className="mt-1 break-words text-[13px] leading-relaxed text-white/65">
                      {message.content || "Unknown error."}
                    </p>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={() => onRetry(message)}
                        className="mx-focus mx-press mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.12]"
                      >
                        <RotateCcw size={12} aria-hidden="true" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : showSkeleton ? (
              /* Waiting for the first chunk — shimmering placeholder bars. */
              <div className="flex flex-col gap-2 pt-0.5" aria-hidden="true">
                <span className="mx-skeleton h-[13px] w-[70%] rounded" />
                <span className="mx-skeleton h-[13px] w-[52%] rounded" />
                <span className="mx-skeleton h-[13px] w-[38%] rounded" />
              </div>
            ) : (
              <div className="text-[15px] leading-relaxed">
                <MarkdownLite content={message.content} />
                {streaming && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "ml-1 inline-block h-[1em] w-[2px] translate-y-[2px] bg-white/90",
                      !reduceMotion && "animate-pulse"
                    )}
                  />
                )}
              </div>
            )}
            {message.role === "assistant" && !streaming && message.blocks && message.blocks.length > 0 && (
              <ProjectAnalytics blocks={message.blocks} />
            )}
            <time className="mt-1.5 block font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {time}
            </time>
          </div>
        </>
      )}
    </motion.div>
  );
}

const MessageRow = memo(MessageRowImpl);
export default MessageRow;
