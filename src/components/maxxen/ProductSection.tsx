"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  GitBranch,
  KeyRound,
  Mail,
  MessageSquare,
  Puzzle,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { PHILOSOPHY, SUPERPOWERS, type SuperpowerCard } from "@/lib/constants";
import { cn } from "@/lib/utils";
import SplitText from "./motion/SplitText";
import TiltFrame from "./motion/TiltFrame";

const GLYPH_ICONS: Record<SuperpowerCard["glyph"], LucideIcon> = {
  chat: MessageSquare,
  key: KeyRound,
  github: GitBranch,
  puzzle: Puzzle,
  rocket: Rocket,
  mail: Mail,
};

/** Rocket glyph drifts diagonally; everything else sits still. */
function Glyph({ glyph }: { glyph: SuperpowerCard["glyph"] }) {
  const reduced = useReducedMotion();
  const Icon = GLYPH_ICONS[glyph];
  const icon = (
    <Icon size={15} strokeWidth={1.5} aria-hidden="true" className="text-white/90" />
  );
  if (glyph === "rocket" && !reduced) {
    return (
      <motion.span
        className="grid place-items-center"
        animate={{ x: [0, 4, 0], y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {icon}
      </motion.span>
    );
  }
  return <span className="grid place-items-center">{icon}</span>;
}

/** Tabular counter looping 0→500 with a hold — the "Composio" pulse. */
function LoopCounter() {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    const finish = () => setValue(500);
    if (reduced) {
      finish();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const DURATION = 2200;
    const TOTAL = 4800;
    const tick = (time: number) => {
      const elapsed = (time - start) % TOTAL;
      const progress = Math.min(elapsed / DURATION, 1);
      setValue(Math.round(500 * (1 - Math.pow(1 - progress, 3))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <p className="mt-auto pt-5 font-mono text-xs text-muted-foreground">
      <span className="tabular-nums text-white/80">{value}</span>+ toolkits
      connected
    </p>
  );
}

/** Six OTP boxes with flickering digits; one box carries the glint. */
function OtpBoxes() {
  const reduced = useReducedMotion();
  const [digits, setDigits] = useState<number[]>(() => Array(6).fill(0));

  useEffect(() => {
    const randomize = () =>
      setDigits(Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)));
    randomize();
    if (reduced) return;
    const id = window.setInterval(() => {
      setDigits((prev) => {
        const next = [...prev];
        next[Math.floor(Math.random() * 6)] = Math.floor(Math.random() * 10);
        return next;
      });
    }, 700);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="mt-auto flex items-center gap-1 pt-5" aria-hidden="true">
      {digits.map((digit, index) => (
        <span
          key={index}
          className={cn(
            "grid h-6 w-5 place-items-center rounded border font-mono text-[11px] tabular-nums",
            index === 2
              ? "border-glint text-glint"
              : "border-white/[0.12] text-white/70"
          )}
        >
          {digit}
        </span>
      ))}
    </div>
  );
}

/** Per-card bottom status row — the unique micro motion for each glyph. */
function CardMicroMotion({ glyph }: { glyph: SuperpowerCard["glyph"] }) {
  const reduced = useReducedMotion();

  switch (glyph) {
    case "chat":
      return (
        <div className="mt-auto flex items-center gap-1.5 pt-5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="h-1.5 w-1.5 rounded-full bg-white/60"
              animate={
                reduced
                  ? undefined
                  : { y: [0, -3, 0], opacity: [0.35, 1, 0.35] }
              }
              transition={{
                duration: 0.9,
                repeat: Infinity,
                delay: index * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
          <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            building
          </span>
        </div>
      );
    case "github":
      return (
        <div className="mt-auto pt-5" aria-hidden="true">
          <svg width="120" height="8" viewBox="0 0 120 8" fill="none">
            <motion.line
              x1="0"
              y1="4"
              x2="120"
              y2="4"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1"
              strokeDasharray="4 4"
              animate={reduced ? undefined : { strokeDashoffset: [0, -16] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          </svg>
        </div>
      );
    case "puzzle":
      return <LoopCounter />;
    case "mail":
      return <OtpBoxes />;
    case "key":
    case "rocket":
    default:
      return null;
  }
}

/** One superpower bento card: glyph chip, meta, copy, tags, micro motion. */
function SuperpowerCardView({
  card,
  index,
}: {
  card: SuperpowerCard;
  index: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.6,
        delay: reduced ? 0 : index * 0.08,
        ease: "easeOut",
      }}
      className="h-full"
    >
      <TiltFrame className="h-full rounded-2xl">
        <article className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
              <Glyph glyph={card.glyph} />
              {card.glyph === "key" && (
                <span
                  aria-hidden="true"
                  className="bg-glint animate-glint absolute -right-1 -top-1 h-2 w-2 rounded-full"
                />
              )}
            </span>
            <p className="text-right font-mono text-xs leading-5 text-muted-foreground">
              {card.meta}
            </p>
          </div>

          <h3 className="mt-5 text-lg font-medium tracking-tight text-white">
            {card.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {card.body}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.08] px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          <CardMicroMotion glyph={card.glyph} />
        </article>
      </TiltFrame>
    </motion.div>
  );
}

/**
 * ProductSection (id="product") — "One workspace. Every superpower."
 * A 6-card bento grid built from SUPERPOWERS; every card carries a unique
 * micro motion (typing dots, glint dot, data line, live counter, drifting
 * rocket, flickering OTP boxes) plus a TiltFrame pointer tilt.
 */
export function ProductSection() {
  const reduced = useReducedMotion();

  return (
    <section
      id="product"
      aria-labelledby="product-heading"
      className="scroll-mt-20 px-6 py-24 md:px-16 md:py-32 lg:px-28"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="product-heading"
          className="max-w-3xl text-4xl font-medium leading-[1.1] tracking-tight md:text-5xl"
        >
          <SplitText text="One workspace. Every" />{" "}
          <SplitText
            text="superpower"
            by="words"
            delay={0.4}
            leafClassName="text-chrome"
          />
          <SplitText text="." delay={0.55} />
        </h2>
        <motion.p
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground"
        >
          {PHILOSOPHY.supporting}
        </motion.p>

        <div className="mt-14 grid gap-4 md:mt-16 md:grid-cols-2 lg:grid-cols-3">
          {SUPERPOWERS.map((card, index) => (
            <SuperpowerCardView key={card.id} card={card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
