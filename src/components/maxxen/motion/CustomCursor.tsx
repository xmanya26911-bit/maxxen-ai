"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], [data-cursor]';

/**
 * CustomCursor — chrome ring follower + exact-position dot.
 *
 * - 28px ring (white/60, mix-blend-difference) lags the pointer on a spring
 *   (stiffness 300, damping 28).
 * - 5px solid white dot tracks the pointer exactly.
 * - Hovering any a/button/[role="button"]/[data-cursor] element (tracked via
 *   document-level mouseover/mouseout + closest()) scales the ring to 2.2x
 *   and tints its border with the glint accent.
 * - Fine-pointer devices only; disabled under reduced motion. The native
 *   cursor stays visible; the layer is pointer-events-none (z-[90]).
 */
export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 300, damping: 28 });
  const ringY = useSpring(y, { stiffness: 300, damping: 28 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const activate = () => setEnabled(true);
    if (!fine.matches || reduced.matches) return;
    activate();

    const onMove = (event: MouseEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };
    const onOver = (event: MouseEvent) => {
      const { target } = event;
      setHovering(
        target instanceof Element &&
          target.closest(INTERACTIVE_SELECTOR) !== null
      );
    };
    const onOut = (event: MouseEvent) => {
      const { relatedTarget } = event;
      setHovering(
        relatedTarget instanceof Element &&
          relatedTarget.closest(INTERACTIVE_SELECTOR) !== null
      );
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      {/* Lagging chrome ring */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[90]"
        style={{ x: ringX, y: ringY }}
      >
        <motion.div
          animate={{ scale: hovering ? 2.2 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className={cn(
            "h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border mix-blend-difference transition-colors duration-200",
            hovering ? "border-glint" : "border-white/60"
          )}
        />
      </motion.div>
      {/* Exact pointer dot */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[90]"
        style={{ x, y }}
      >
        <div className="h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </motion.div>
    </>
  );
}
