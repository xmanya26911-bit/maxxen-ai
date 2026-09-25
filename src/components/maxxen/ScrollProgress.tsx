"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";

/**
 * ScrollProgress — fixed 2px reading-progress bar pinned to the top edge.
 * Scroll position is smoothed through a spring (stiffness 140, damping 30)
 * and mapped to scaleX with a left origin. Decorative, click-transparent,
 * fixed so it never causes layout shift. Intentionally kept visible for
 * prefers-reduced-motion users (informational, not decorative motion).
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, 1]),
    { stiffness: 140, damping: 30 }
  );

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left bg-white/80"
      style={{ scaleX }}
    />
  );
}
