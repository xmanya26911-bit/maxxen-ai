"use client";

import { Fragment } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

type SplitMode = "inView" | "mount";
type SplitBy = "chars" | "words";

export interface SplitTextProps {
  /** Source text — re-exposed to assistive tech via aria-label on the root. */
  text: string;
  /** Root wrapper classes (layout/typography — font sizes, tracking, display). */
  className?: string;
  /**
   * Classes applied to each animated leaf span. Put paint-critical classes
   * here (e.g. .text-chrome / .text-chrome-sheen): transformed descendants of
   * a background-clip:text element can render invisibly, so gradients must
   * live on the transformed element itself.
   */
  leafClassName?: string;
  /** Base delay (s) before the first leaf animates. Default 0. */
  delay?: number;
  /** Per-leaf stagger (s). Default 0.018. */
  stagger?: number;
  /** Fire the in-view reveal only once. Default true. */
  once?: boolean;
  /** "mount" animates on mount; "inView" (default) animates on viewport entry. */
  mode?: SplitMode;
  /** Split granularity. Default "chars". */
  by?: SplitBy;
  /** mount-mode gate: while false, leaves hold their initial state (preloader sync). */
  play?: boolean;
}

const INIT = { opacity: 0, y: "0.6em", rotateX: -45 };
const SHOWN = { opacity: 1, y: 0, rotateX: 0 };
const DURATION = 0.55;

/**
 * SplitText — per-character (or per-word) 3D reveal.
 *
 * ONE IntersectionObserver lives on the root (whileInView) and drives a
 * variant tree: `staggerChildren` sequences the leaves deterministically.
 * Per-leaf observers proved unreliable in headless engines (first leaves
 * never fired), so the root-observer pattern is mandatory here.
 *
 * Words are whitespace-nowrap wrappers (perspective parents); chars are the
 * animated leaves. The root carries aria-label={text}, leaves are aria-hidden.
 *
 * Reduced motion: plain static text (leaf classes merged so gradients keep).
 */
export default function SplitText({
  text,
  className,
  leafClassName,
  delay = 0,
  stagger = 0.018,
  once = true,
  mode = "inView",
  by = "chars",
  play = true,
}: SplitTextProps) {
  const reduced = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: by === "words" ? Math.max(stagger * 10, 0.1) : stagger,
        delayChildren: delay,
      },
    },
  };

  const leaf: Variants = {
    hidden: INIT,
    show: { ...SHOWN, transition: { duration: DURATION, ease: [0.22, 1, 0.36, 1] } },
  };

  if (reduced) {
    return <span className={cn(className, leafClassName)}>{text}</span>;
  }

  const words = text.split(" ");

  const leafSpan = (key: string, content: string) => (
    <motion.span
      key={key}
      aria-hidden="true"
      variants={leaf}
      className={cn("inline-block will-change-[transform,opacity]", leafClassName)}
      style={{ transformOrigin: "50% 100%" }}
    >
      {content}
    </motion.span>
  );

  return (
    <motion.span
      className={cn("inline-block", className)}
      aria-label={text}
      variants={container}
      initial="hidden"
      {...(mode === "mount"
        ? { animate: play ? "show" : "hidden" }
        : { whileInView: "show", viewport: { once, amount: 0.2 } })}
    >
      {words.map((word, wi) => (
        <Fragment key={wi}>
          <span className="inline-block whitespace-nowrap" style={{ perspective: 700 }}>
            {by === "words"
              ? leafSpan(`w${wi}`, word)
              : Array.from(word).map((char, ci) =>
                  leafSpan(`w${wi}c${ci}`, char)
                )}
          </span>
          {wi < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </motion.span>
  );
}
