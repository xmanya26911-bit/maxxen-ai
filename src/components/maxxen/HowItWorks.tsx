"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { HOW_STEPS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import SplitText from "./motion/SplitText";

const TYPE_SPEED_MS = 18;

/**
 * useTypewriter — reveals `text` character by character (~18ms/char) once
 * `start` fires. Reduced motion: full text immediately.
 */
function useTypewriter(
  text: string,
  start: boolean,
  reduced: boolean,
  msPerChar = TYPE_SPEED_MS
) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    if (!start) return;
    const showAll = () => setVisible(text);
    const reset = () => setVisible("");
    if (reduced) {
      showAll();
      return;
    }
    reset();
    let revealed = 0;
    const id = window.setInterval(() => {
      revealed += 1;
      setVisible(text.slice(0, revealed));
      if (revealed >= text.length) window.clearInterval(id);
    }, msPerChar);
    return () => window.clearInterval(id);
  }, [start, reduced, text, msPerChar]);

  return visible;
}

/**
 * One colored terminal line. "$" prompts render dim, "✓" marks white and
 * "#" note lines dimmest; the last line carries a blinking block cursor.
 * Exported so the Security section renders its terminal identically.
 */
export function TerminalLine({
  line,
  showCursor = false,
}: {
  line: string;
  showCursor?: boolean;
}) {
  if (line.length === 0) return <div className="h-2" aria-hidden="true" />;

  const tone = line.startsWith("✓")
    ? "text-white/90"
    : line.startsWith("#")
      ? "text-white/35"
      : "text-white/50";

  return (
    <p className={cn("whitespace-pre-wrap", tone)}>
      {line}
      {showCursor && (
        <span
          aria-hidden="true"
          className="animate-pulse ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] bg-white/80"
        />
      )}
    </p>
  );
}

/** Terminal card that types its content when scrolled into view (once). */
function Terminal({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion() ?? false;
  const visible = useTypewriter(text, inView, reduced);
  const lines = visible.split("\n");

  return (
    <div
      ref={ref}
      aria-label="Terminal session"
      className="rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-[13px] leading-6"
    >
      {lines.map((line, index) => (
        <TerminalLine
          key={index}
          line={line}
          showCursor={index === lines.length - 1}
        />
      ))}
    </div>
  );
}

/**
 * HowItWorks (id="how") — three numbered steps with chrome numerals, each
 * carrying a terminal card that types HOW_STEPS[i].terminal on entry.
 * The middle column is vertically offset on large screens for a staggered
 * rhythm.
 */
export function HowItWorks() {
  const reduced = useReducedMotion();

  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="scroll-mt-20 border-t border-white/[0.06] px-6 py-24 md:px-16 md:py-32 lg:px-28"
    >
      <div className="mx-auto max-w-6xl">
        <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <span
            aria-hidden="true"
            className="bg-glint animate-glint h-1.5 w-1.5 rounded-full"
          />
          How it works
        </p>
        <h2
          id="how-heading"
          className="mt-4 text-4xl font-medium tracking-tight md:text-5xl"
        >
          <SplitText text="Live in" />{" "}
          <SplitText
            text="three steps."
            by="words"
            delay={0.22}
            className="font-serif font-normal italic tracking-[-0.01em]"
            leafClassName="text-chrome"
          />
        </h2>

        <div className="mt-14 grid gap-10 md:mt-16 lg:grid-cols-3 lg:gap-8">
          {HOW_STEPS.map((step, index) => (
            <motion.article
              key={step.number}
              initial={{ opacity: 0, y: reduced ? 0 : 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.6,
                delay: reduced ? 0 : index * 0.12,
                ease: "easeOut",
              }}
              className={cn(
                "border-t border-white/10 pt-8",
                index === 1 && "lg:mt-12"
              )}
            >
              <p className="text-chrome text-6xl font-semibold leading-none tracking-tight">
                {step.number}
              </p>
              <h3 className="mt-5 text-xl font-medium tracking-tight text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {step.body}
              </p>
              <div className="mt-6">
                <Terminal text={step.terminal} />
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
