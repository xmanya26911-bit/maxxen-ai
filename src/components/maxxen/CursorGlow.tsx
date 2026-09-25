"use client";

import { useEffect, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

const GLOW_SIZE = 640;
/** Centers the 640px circle on the (sprung) pointer coordinates. */
const GLOW_OFFSET = -GLOW_SIZE / 2;

/**
 * CursorGlow — site-wide monochrome cursor spotlight.
 *
 * A 640px soft white radial gradient trails the pointer via spring-smoothed
 * motion values (stiffness 120, damping 24). Rendered only on fine-pointer
 * devices and only after the first mousemove; disabled entirely for
 * prefers-reduced-motion. Purely decorative and click-transparent.
 * SSR-safe: `window` is only accessed inside effects.
 */
export default function CursorGlow() {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 120, damping: 24 });
  const springY = useSpring(mouseY, { stiffness: 120, damping: 24 });
  const glowX = useTransform(springX, (value) => value + GLOW_OFFSET);
  const glowY = useTransform(springY, (value) => value + GLOW_OFFSET);

  /* Enable only on fine pointers (mouse/trackpad), never on touch. */
  useEffect(() => {
    if (reduced) return;
    const media = window.matchMedia("(pointer: fine)");
    const sync = () => setEnabled(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [reduced]);

  useEffect(() => {
    if (!enabled) return;
    const onMove = (event: MouseEvent) => {
      mouseX.set(event.clientX);
      mouseY.set(event.clientY);
      setVisible(true);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [enabled, mouseX, mouseY]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      <motion.div
        className="absolute left-0 top-0 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.055),transparent_65%)]"
        style={{ x: glowX, y: glowY }}
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}
