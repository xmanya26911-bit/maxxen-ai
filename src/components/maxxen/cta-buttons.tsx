"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

const BASE =
  "group relative inline-flex items-center justify-center overflow-hidden rounded-full px-8 py-3.5 text-base font-medium tracking-[-0.01em] transition-colors mx-focus";

const MOTION = { whileHover: { scale: 1.03 }, whileTap: { scale: 0.98 } };

/**
 * Magnetic cursor attraction — the surface leans gently toward the pointer
 * and springs back on leave. Disabled for reduced-motion users.
 */
function useMagnetic(disabled: boolean | null) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 22, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 260, damping: 22, mass: 0.6 });

  const onMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - (rect.left + rect.width / 2)) * 0.16);
    y.set((event.clientY - (rect.top + rect.height / 2)) * 0.3);
  };

  const onMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return { style: { x: springX, y: springY }, onMouseMove, onMouseLeave };
}

/**
 * Light-refraction sweep crossing the surface on hover.
 * `dark` = gloss on the white button, `light` = glare on glass buttons.
 */
function Sheen({ tone }: { tone: "dark" | "light" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[180%] -skew-x-12 opacity-0 blur-md transition-all duration-700 ease-out group-hover:translate-x-[340%] group-hover:opacity-100",
        tone === "dark" ? "bg-black/10" : "bg-white/20"
      )}
    />
  );
}

export function PrimaryCTA({
  children,
  href,
  onClick,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const magnetic = useMagnetic(reduced);
  const cls = cn(
    BASE,
    "bg-white font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_36px_-12px_rgba(255,255,255,0.45)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_14px_52px_-10px_rgba(255,255,255,0.6)]",
    reduced && "transition-none",
    className
  );

  if (href) {
    return (
      <motion.a
        href={href}
        onClick={onClick}
        className={cls}
        {...MOTION}
        {...magnetic}
      >
        <span className="relative z-10 inline-flex items-center">{children}</span>
        <Sheen tone="dark" />
      </motion.a>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cls}
      {...MOTION}
      {...magnetic}
    >
      <span className="relative z-10 inline-flex items-center">{children}</span>
      <Sheen tone="dark" />
    </motion.button>
  );
}

export function GhostCTA({
  children,
  href,
  onClick,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const magnetic = useMagnetic(reduced);
  const cls = cn(
    BASE,
    "border border-white/15 bg-white/[0.03] text-white backdrop-blur-sm hover:bg-white/[0.07]",
    reduced && "transition-none",
    className
  );

  if (href) {
    return (
      <motion.a
        href={href}
        onClick={onClick}
        className={cls}
        {...MOTION}
        {...magnetic}
      >
        <span className="relative z-10 inline-flex items-center">{children}</span>
        <Sheen tone="light" />
      </motion.a>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cls}
      {...MOTION}
      {...magnetic}
    >
      <span className="relative z-10 inline-flex items-center">{children}</span>
      <Sheen tone="light" />
    </motion.button>
  );
}
