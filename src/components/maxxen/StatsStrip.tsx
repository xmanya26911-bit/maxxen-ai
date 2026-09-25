"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";

interface Metric {
  value: number;
  decimals: number;
  suffix: string;
  label: string;
}

const METRICS: Metric[] = [
  { value: 1.4, decimals: 1, suffix: "M+", label: "Apps shipped with MAXXEN" },
  { value: 38, decimals: 0, suffix: "k", label: "Teams building daily" },
  { value: 12, decimals: 0, suffix: "×", label: "Faster idea-to-production" },
  { value: 99.99, decimals: 2, suffix: "%", label: "Platform uptime" },
];

/* Hairline dividers computed per cell — pixel-correct for both the 2×2 mobile
   grid and the 1×4 desktop grid (no stray edge lines from divide-* on grids). */
const CELL_BORDERS = [
  "",
  "border-l",
  "border-t lg:border-l",
  "border-t border-l lg:border-t-0",
] as const;

/** Single metric: springs a 0→value count-up when scrolled into view. */
function MetricCell({ metric, index }: { metric: Metric; index: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const count = useMotionValue(0);
  const [display, setDisplay] = useState(() => (0).toFixed(metric.decimals));

  useMotionValueEvent(count, "change", (latest) => {
    setDisplay(latest.toFixed(metric.decimals));
  });

  useEffect(() => {
    if (reduced) {
      count.set(metric.value);
      return;
    }
    if (!inView) return;
    const controls = animate(count, metric.value, {
      duration: 1.8,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [reduced, inView, count, metric.value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: reduced ? 0 : index * 0.1, ease: "easeOut" }}
      className={`border-white/[0.06] px-6 py-10 text-center md:px-10 md:py-12 ${CELL_BORDERS[index]}`}
    >
      <p className="text-4xl font-medium tracking-tight tabular-nums text-white md:text-5xl">
        {display}
        <span className="text-muted-foreground">{metric.suffix}</span>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{metric.label}</p>
    </motion.div>
  );
}

/**
 * StatsStrip — count-up metrics band. Numbers ease from 0 to their value
 * (≈1.8s) when the band enters the viewport, separated by hairline borders.
 * Reduced motion: final values are shown immediately, no slide-in transforms.
 */
export default function StatsStrip() {
  return (
    <section aria-label="MAXXEN in numbers" className="border-y border-white/[0.06]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
        {METRICS.map((metric, index) => (
          <MetricCell key={metric.label} metric={metric} index={index} />
        ))}
      </div>
    </section>
  );
}
