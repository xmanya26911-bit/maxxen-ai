"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from "framer-motion";
import { ChromeLogo } from "../logo";
import { REVEAL_EVENT } from "./useRevealGate";

const SESSION_KEY = "mx-preloaded";
const COUNT_SECONDS = 1.5;
const EXIT_SECONDS = 0.8;
const FAILSAFE_MS = 2600;
const COUNT_EASE = [0.65, 0, 0.35, 1] as const;
const EXIT_EASE = [0.76, 0, 0.24, 1] as const;

type Phase = "undecided" | "counting" | "exiting" | "gone";

/** Layout effect on the client (decides visibility before first paint), effect on the server. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Preloader — black full-screen boot curtain for first-time visitors.
 *
 * Chrome emblem + "MAXXEN" chrome wordmark + eased mono 0→100 counter
 * (~1.5s), then the whole overlay slides up (0.8s, [0.76,0,0.24,1]) revealing
 * the page beneath (which renders from the start — this is overlay-only).
 *
 * - Shows once per session (sessionStorage "mx-preloaded"); repeat visits
 *   never paint it (decision happens in a layout effect, pre-paint).
 * - 2.6s hard failsafe force-completes the sequence.
 * - Locks document scroll while visible, restores on exit completion.
 * - Reduced motion: renders nothing at all.
 */
export default function Preloader() {
  /* "undecided" renders the overlay so SSR/first paint matches (no flash); the
     layout effect then resolves to counting/exiting/gone before paint. */
  const [phase, setPhase] = useState<Phase>("undecided");
  const count = useMotionValue(0);
  const [pct, setPct] = useState(0);

  useMotionValueEvent(count, "change", (value) =>
    setPct(Math.min(100, Math.round(value)))
  );

  /* Set (once) the moment the exit begins — guards the failsafe racing the
     counter's own onComplete. Read only from callbacks, never during render. */
  const exitingRef = useRef(false);

  /** Idempotently begin the exit: flag the session, notify the hero, slide up. */
  const complete = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* private mode — preloader may show again next navigation, acceptable */
    }
    window.dispatchEvent(new Event(REVEAL_EVENT));
    setPhase("exiting");
  }, []);

  useIsomorphicLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let preloaded = false;
    try {
      preloaded = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (reduced || preloaded) {
      setPhase("gone");
      return;
    }
    setPhase("counting");
    document.documentElement.style.overflow = "hidden";
    const controls = animate(count, 100, {
      duration: COUNT_SECONDS,
      ease: COUNT_EASE,
      onComplete: complete,
    });
    const failsafe = window.setTimeout(complete, FAILSAFE_MS);
    return () => {
      controls.stop();
      window.clearTimeout(failsafe);
      document.documentElement.style.overflow = "";
    };
  }, [count, complete]);

  if (phase === "gone") return null;

  return (
    <motion.div
      id="mx-preloader"
      aria-hidden="true"
      initial={false}
      animate={phase === "exiting" ? { y: "-100%" } : { y: 0 }}
      transition={{ duration: EXIT_SECONDS, ease: EXIT_EASE }}
      onAnimationComplete={() => {
        if (!exitingRef.current) return;
        document.documentElement.style.overflow = "";
        setPhase("gone");
      }}
      className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
    >
      <ChromeLogo size={120} glow />
      <span className="text-chrome-sheen mt-6 text-2xl font-semibold tracking-[0.32em]">
        MAXXEN
      </span>
      <span className="mt-5 font-mono text-xs tabular-nums text-white/50">
        {pct}%
      </span>
      {/* No-JS insurance: never trap non-hydrating visitors behind the curtain */}
      <noscript>
        <style>{"#mx-preloader{display:none!important}"}</style>
      </noscript>
    </motion.div>
  );
}
