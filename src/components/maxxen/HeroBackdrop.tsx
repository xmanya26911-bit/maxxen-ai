"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * HeroBackdrop — purely decorative ambient layer for the hero section.
 *
 * Stacks a radially-masked animated grid, two drifting monochrome glow orbs,
 * a slow diagonal light-beam sweep (framer-motion) and a film-grain overlay.
 * Fully inert: aria-hidden, pointer-events-none, sits at z-0 behind content.
 * Reduced motion: the sweeping beam is not rendered; CSS animations are
 * neutralized globally via the reduced-motion media query in globals.css.
 */
export default function HeroBackdrop() {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Fine animated grid — visible only near the top-center, fading outward */}
      <div className="bg-grid-fine animate-grid absolute inset-0 [mask-image:radial-gradient(75%_60%_at_50%_28%,black,transparent)]" />

      {/* Drifting glow orb — top-left */}
      <div className="animate-float absolute -left-40 -top-44 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.07),transparent_70%)] blur-3xl" />

      {/* Drifting glow orb — right-center */}
      <div className="animate-float-alt absolute -right-52 top-1/3 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.05),transparent_70%)] blur-3xl" />

      {/* Diagonal light beam — one full sweep every ~12s */}
      {!reduced && (
        <motion.div
          className="absolute left-0 top-[-20%] h-[140%] w-1/3 rotate-12 bg-gradient-to-b from-transparent via-white/[0.04] to-transparent blur-xl"
          animate={{ x: ["-120%", "420%"] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Film grain */}
      <div className="noise-overlay absolute inset-0 opacity-[0.03] mix-blend-soft-light" />
    </div>
  );
}
