"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Gauge,
  LayoutTemplate,
  PenTool,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { CHAT_SUGGESTIONS } from "@/lib/constants";
import { ChromeLogo } from "@/components/maxxen/logo";
import ChromeRing from "@/components/maxxen/motion/ChromeRing";
import { cn } from "@/lib/utils";

/** Shared cinematic easing for entrance motion. */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SUGGESTION_ICONS: Record<(typeof CHAT_SUGGESTIONS)[number]["icon"], LucideIcon> = {
  layout: LayoutTemplate,
  gauge: Gauge,
  pen: PenTool,
  plug: Plug,
};

/** Four-point sparkle with staggerable twinkle animation. */
function Sparkle({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("h-3.5 w-3.5 fill-white", className)}
      style={{ animationDelay: `${delay}s` }}
    >
      <path d="M12 1.5c1 5.6 5 9.9 10.5 10.5C17 12.6 13 16.9 12 22.5 11 16.9 7 12.6 1.5 12 7 11.4 11 7.1 12 1.5Z" />
    </svg>
  );
}

export interface EmptyStateProps {
  /** Sends a suggestion prompt immediately. */
  onPick: (prompt: string) => void;
}

/**
 * EmptyState — chrome centerpiece (spinning chrome-ring + floating logo +
 * twinkling sparkles), sheen headline and the 2×2 CHAT_SUGGESTIONS grid
 * with a hover arrow affordance.
 */
export default function EmptyState({ onPick }: EmptyStateProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="my-auto flex w-full flex-col items-center py-6 text-center">
      {/* Chrome centerpiece */}
      <motion.div
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE }}
        className="relative mb-7 h-[112px] w-[112px] sm:mb-8 sm:h-[140px] sm:w-[140px]"
        aria-hidden="true"
      >
        <ChromeRing className="animate-spin-slow absolute inset-0 h-full w-full" />
        <Sparkle className="animate-twinkle absolute -right-2 top-3" />
        <Sparkle className="animate-twinkle absolute -left-2 bottom-8" delay={1.6} />
        <div className="animate-float absolute inset-0 flex items-center justify-center">
          <ChromeLogo size={76} className="sm:hidden" />
          <ChromeLogo size={96} className="hidden sm:block" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.1, duration: reduceMotion ? 0 : 0.45, ease: EASE }}
        className="text-chrome-sheen text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-4xl md:text-5xl"
      >
        What should we build?
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.18, duration: reduceMotion ? 0 : 0.45, ease: EASE }}
        className="mt-4 max-w-[42ch] text-balance text-sm leading-relaxed text-muted-foreground md:text-[15px]"
      >
        Describe anything — websites, apps, dashboards, automations. MAXXEN plans, writes and
        previews it with you.
      </motion.p>

      {/* Suggestions */}
      <div className="mt-9 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {CHAT_SUGGESTIONS.map((suggestion, index) => {
          const Icon = SUGGESTION_ICONS[suggestion.icon];
          return (
            <motion.button
              key={suggestion.title}
              type="button"
              onClick={() => onPick(suggestion.prompt)}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: reduceMotion ? 0 : 0.2 + index * 0.06,
                duration: reduceMotion ? 0 : 0.4,
                ease: EASE,
              }}
              className="mx-focus group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05]"
            >
              <span className="flex w-full items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-colors group-hover:border-white/20">
                  <Icon size={13} strokeWidth={1.8} className="text-white/80" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {suggestion.title}
                </span>
                <ArrowUpRight
                  size={13}
                  aria-hidden="true"
                  className="shrink-0 -translate-x-0.5 text-white/25 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                />
              </span>
              <span className="mt-2.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                {suggestion.prompt}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
