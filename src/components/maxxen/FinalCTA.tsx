"use client";

import { motion } from "framer-motion";
import { FINAL_CTA, FINAL_CTA_AVATARS } from "@/lib/constants";
import { GhostCTA, PrimaryCTA } from "./cta-buttons";
import ChromeRing from "./motion/ChromeRing";
import AvatarStack from "./AvatarStack";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const PARTICLES = [
  { left: "12%", top: "30%", delay: "0s", cls: "animate-float" },
  { left: "85%", top: "26%", delay: "1.4s", cls: "animate-float-alt" },
  { left: "78%", top: "72%", delay: "0.7s", cls: "animate-float" },
  { left: "18%", top: "68%", delay: "2.1s", cls: "animate-float-alt" },
] as const;

/**
 * FinalCTA — chrome closing argument.
 * Mono glint eyebrow ("FREE FOREVER · BRING YOUR KEYS"), a small muted
 * "Stop scrolling." over a huge chrome-sheen "Start building.", spinning
 * chrome orbit rings with satellite dots, drifting particles and the
 * builder avatar stack. Primary CTA routes to /chat.
 */
export function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative overflow-hidden border-t border-white/[0.06] px-6 py-32 text-center md:py-44"
    >
      {/* Centered monochrome luminosity */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_55%_at_50%_55%,rgba(255,255,255,0.045),transparent_70%)]"
      />

      {/* Spinning chrome orbit rings with satellite dots */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="relative h-[560px] w-[560px] md:h-[760px] md:w-[760px]">
          <ChromeRing className="animate-spin-slow absolute inset-0 h-full w-full" />
          <div className="animate-spin-slow absolute inset-0">
            <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_12px_2px_rgba(255,255,255,0.5)]" />
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 md:h-[520px] md:w-[520px]">
          <ChromeRing className="animate-spin-slow absolute inset-0 h-full w-full [animation-direction:reverse]" />
          <div className="animate-spin-slow absolute inset-0 [animation-direction:reverse]">
            <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/50 shadow-[0_0_10px_2px_rgba(255,255,255,0.4)]" />
          </div>
        </div>
      </div>

      {/* Drifting particles */}
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`pointer-events-none absolute h-1 w-1 rounded-full bg-white/40 ${particle.cls}`}
          style={{ left: particle.left, top: particle.top, animationDelay: particle.delay }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: EASE }}
        className="relative mx-auto max-w-5xl"
      >
        <p className="mx-auto flex w-fit items-center gap-2.5 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <span
            aria-hidden="true"
            className="bg-glint animate-glint h-1.5 w-1.5 rounded-full"
          />
          Free forever · Bring your keys
        </p>

        <h2 id="final-cta-heading" className="mt-8">
          <span className="block text-xl font-normal text-muted-foreground md:text-2xl">
            Stop scrolling.
          </span>
          <span className="text-chrome-sheen mt-3 block text-6xl font-medium leading-[1.02] tracking-[-2px] md:text-7xl lg:text-8xl">
            Start building.
          </span>
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-7 text-muted-foreground md:text-xl">
          {FINAL_CTA.supporting}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <PrimaryCTA href="/chat">{FINAL_CTA.primary}</PrimaryCTA>
          <GhostCTA href="#product">{FINAL_CTA.secondary}</GhostCTA>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
          className="mt-12 flex flex-col items-center gap-3"
        >
          <AvatarStack avatars={FINAL_CTA_AVATARS} plusLabel="+38k" size={32} />
          <p className="text-sm text-muted-foreground">
            Join{" "}
            <span className="font-medium text-white">38,000+</span> builders
            shipping with MAXXEN.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
