"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

export interface TiltFrameProps {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees around each axis. Default 7. */
  max?: number;
}

/**
 * TiltFrame — 3D pointer-tilt container with a cursor glare.
 *
 * Pointer position drives rotateX/rotateY springs (stiffness 180, damping 20)
 * around the center inside a 1200px perspective, a 420px radial glare follows
 * the cursor via --gx/--gy CSS vars, and a faint hairline ring + 1.005 scale
 * appear on hover.
 *
 * Touch devices and reduced-motion users get a static frame (no tilt, no
 * glare). The glare/ring use rounded-[inherit] so callers control the radius.
 */
export default function TiltFrame({
  children,
  className,
  max = 7,
}: TiltFrameProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine)");
    const sync = () => setFinePointer(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, { stiffness: 180, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 180, damping: 20 });

  const enabled = !reduced && finePointer;

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!enabled || !el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * max * 2);
    rotateX.set(-py * max * 2);
    el.style.setProperty("--gx", `${(px + 0.5) * 100}%`);
    el.style.setProperty("--gy", `${(py + 0.5) * 100}%`);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ "--gx": "50%", "--gy": "50%" } as React.CSSProperties}
      className={cn(
        "relative [perspective:1200px]",
        enabled && "group",
        className
      )}
    >
      <motion.div
        style={{ rotateX: springRotateX, rotateY: springRotateY }}
        whileHover={enabled ? { scale: 1.005 } : undefined}
        className="relative h-full w-full rounded-[inherit] [transform-style:preserve-3d]"
      >
        {children}

        {enabled && (
          <>
            {/* Cursor glare */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(420px_circle_at_var(--gx)_var(--gy),rgba(255,255,255,0.07),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
            {/* Faint chrome ring on hover */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/[0.14] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          </>
        )}
      </motion.div>
    </div>
  );
}
