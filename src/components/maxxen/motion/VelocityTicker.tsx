"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  useVelocity,
} from "framer-motion";
import { TICKER_ITEMS } from "@/lib/constants";

const COPIES = 3;
const BASE_SPEED = 60; // px/s
const MAX_INFLUENCE = 400; // px/s clamp for scroll-velocity whip

/** One repeating copy of the capability words with glint ✦ separators. */
function TickerCopy({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {TICKER_ITEMS.map((item) => (
        <div key={item} className="flex shrink-0 items-center">
          <span className="text-chrome px-6 text-2xl font-semibold uppercase tracking-[0.2em] md:px-10 md:text-4xl">
            {item}
          </span>
          <span aria-hidden="true" className="text-glint animate-glint text-sm">
            ✦
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * VelocityTicker — full-bleed chrome capability band, tilted -1.5deg.
 *
 * The marquee integrates its own x position at ~60px/s and adds scroll
 * velocity (useVelocity(scrollY) × 0.35, clamped ±400px/s) so scrolling whips
 * the band faster (and reverses it when scrolling up). Three copies loop
 * seamlessly within [-copyWidth, 0); edges are masked with .mask-fade-x.
 *
 * Reduced motion: the row renders static (no integration).
 */
export default function VelocityTicker() {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const copyWidth = useRef(1);
  const x = useMotionValue(0);

  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const influence = useTransform(scrollVelocity, (value) =>
    Math.max(-MAX_INFLUENCE, Math.min(MAX_INFLUENCE, value * 0.35))
  );

  /* Measure one copy's layout width (unaffected by the band's rotation). */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      copyWidth.current = Math.max(track.scrollWidth / COPIES, 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useAnimationFrame((_, delta) => {
    if (reduced) return;
    const width = copyWidth.current;
    if (width < 10) return;
    const dt = Math.min(delta, 64) / 1000;
    const speed = BASE_SPEED + influence.get();
    const next = x.get() + speed * dt;
    /* Wrap into [-copyWidth, 0) for a seamless 3-copy loop. */
    x.set((((next % width) + width) % width) - width);
  });

  return (
    <section aria-label="What MAXXEN builds" className="relative py-12 md:py-16">
      {/* Vertical padding + overflow clip absorb the rotation's corners */}
      <div className="overflow-hidden">
        <div className="-mx-[3vw] -rotate-[1.5deg] border-y border-white/[0.08] bg-white/[0.02] py-4">
          <div className="mask-fade-x overflow-hidden">
            <motion.div
              ref={trackRef}
              style={{ x }}
              className="flex w-max items-center"
            >
              <TickerCopy />
              <TickerCopy ariaHidden />
              <TickerCopy ariaHidden />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
