"use client";

import { useEffect, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { ArrowUpRight, Star } from "lucide-react";
import { BRAND, HERO, HERO_AVATARS, HERO_CHIPS } from "@/lib/constants";
import { useHeroParallax } from "@/hooks/useParallax";
import { cn } from "@/lib/utils";
import { AnnouncementPill } from "./AnnouncementPill";
import AvatarStack from "./AvatarStack";
import HeroBackdrop from "./HeroBackdrop";
import WorkspacePreview from "./WorkspacePreview";
import { GhostCTA, PrimaryCTA } from "./cta-buttons";
import { ChromeLogo } from "./logo";
import SplitText from "./motion/SplitText";
import ChromeRing from "./motion/ChromeRing";
import TiltFrame from "./motion/TiltFrame";
import { useRevealGate } from "./motion/useRevealGate";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/** Gated entrance: opacity + upward drift, held until the preloader reveals. */
function useReveal(revealed: boolean, delay: number, duration = 0.6, drift = 20) {
  const reduced = useReducedMotion();
  const hidden = { opacity: 0, y: reduced ? 0 : drift } as const;
  return {
    initial: hidden,
    animate: revealed ? { opacity: 1, y: 0 } : hidden,
    transition: {
      duration: reduced ? 0.01 : duration,
      delay: reduced ? 0 : delay,
      ease: EASE,
    },
  } as const;
}

/** Small 4-point sparkle used around the emblem ring. */
function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M12 0 L14.4 9.6 L24 12 L14.4 14.4 L12 24 L9.6 14.4 L0 12 L9.6 9.6 Z"
        fill="rgba(255,255,255,0.4)"
      />
    </svg>
  );
}

/**
 * Hero — Y2K liquid-chrome edition.
 *
 * Chrome emblem floating inside a spinning chrome ring with cardinal sparkles
 * and pointer-parallax, SplitText headline ("BUILD SOMETHING / remarkable
 * DIFFERENT."), chrome stat chips, magnetic CTAs, one-line social proof and
 * the workspace preview wrapped in a TiltFrame. Scroll drives the cinematic
 * parallax exit; mount animations wait for the preloader reveal gate.
 */
export function Hero() {
  const { sectionRef, contentY, contentOpacity, previewY } = useHeroParallax();
  const reduced = useReducedMotion();
  const revealed = useRevealGate();
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine)");
    const sync = () => setFinePointer(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  /* Emblem translates ±10px against the pointer. */
  const emblemX = useMotionValue(0);
  const emblemY = useMotionValue(0);
  const emblemSpringX = useSpring(emblemX, { stiffness: 70, damping: 20 });
  const emblemSpringY = useSpring(emblemY, { stiffness: 70, damping: 20 });

  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (!finePointer || reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    emblemX.set(-clamp(nx) * 10);
    emblemY.set(-clamp(ny) * 10);
  };

  const handleMouseLeave = () => {
    emblemX.set(0);
    emblemY.set(0);
  };

  const announcementReveal = useReveal(revealed, 0, 0.5, 10);
  const emblemReveal = useReveal(revealed, 0.05, 0.7, 24);
  const subReveal = useReveal(revealed, 0.38, 0.6);
  const ctaReveal = useReveal(revealed, 0.48, 0.6);
  const chipsReveal = useReveal(revealed, 0.58, 0.6, 14);
  const proofReveal = useReveal(revealed, 0.66, 0.6, 12);
  const previewReveal = useReveal(revealed, 0.74, 0.8, 40);

  return (
    <section
      id="home"
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-screen overflow-hidden"
    >
      {/* Cinematic monochrome backdrop: grid, glow orbs, light beam, grain */}
      <HeroBackdrop />

      {/* Content column */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-4 pt-28 text-center md:pt-32"
      >
        <motion.div {...announcementReveal}>
          <AnnouncementPill />
        </motion.div>

        {/* Chrome emblem inside a spinning chrome ring */}
        <motion.div {...emblemReveal} className="mt-10 md:mt-12">
          <motion.div
            style={{ x: emblemSpringX, y: emblemSpringY }}
            className="relative grid h-[200px] w-[200px] place-items-center"
          >
            <ChromeRing className="animate-spin-slow absolute inset-0 h-full w-full" />
            <Sparkle
              className="animate-twinkle absolute -top-1.5 left-1/2 h-4 w-4 -translate-x-1/2"
              style={{ animationDelay: "0.4s" }}
            />
            <Sparkle
              className="animate-twinkle absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2"
              style={{ animationDelay: "1.7s" }}
            />
            <motion.div
              animate={
                reduced ? undefined : { y: [0, -10, 0], rotate: [-2, 2, -2] }
              }
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChromeLogo size={132} glow />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Headline — per-char / per-word chrome reveal */}
        <h1 className="mt-10 text-[13vw] font-medium leading-[1.04] tracking-[-0.04em] text-white sm:text-6xl md:mt-12 md:text-7xl lg:text-8xl xl:text-[7rem]">
          <SplitText
            text={BRAND.heroLead}
            mode="mount"
            play={revealed}
            delay={0.12}
            className="block"
          />
          <span className="mt-1 block md:mt-2">
            <SplitText
              text={BRAND.heroChrome}
              mode="mount"
              play={revealed}
              by="words"
              delay={0.42}
              className="font-serif font-normal italic tracking-[-0.01em]"
              leafClassName="text-chrome-sheen text-[1.12em]"
            />{" "}
            <SplitText
              text={BRAND.heroTail}
              mode="mount"
              play={revealed}
              delay={0.55}
            />
          </span>
        </h1>

        <motion.p
          {...subReveal}
          className="mt-6 max-w-[60ch] text-lg font-normal leading-7 text-hero-subtitle md:text-xl"
        >
          {BRAND.sub}
        </motion.p>

        <motion.div
          {...ctaReveal}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 md:mt-10"
        >
          <PrimaryCTA href={BRAND.primaryCtaHref}>
            {BRAND.primaryCta}
            <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </PrimaryCTA>
          <GhostCTA href={BRAND.secondaryCtaHref}>{BRAND.secondaryCta}</GhostCTA>
        </motion.div>

        {/* Chrome stat chips */}
        <motion.dl
          {...chipsReveal}
          className="mt-12 grid grid-cols-2 gap-y-7 sm:grid-cols-4 md:mt-14"
        >
          {HERO_CHIPS.map((chip, index) => (
            <div
              key={chip.label}
              className={cn(
                "flex flex-col items-center gap-1.5 px-5",
                index > 0 && "sm:border-l sm:border-white/[0.08]"
              )}
            >
              <dt className="order-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {chip.label}
              </dt>
              <dd className="text-chrome order-1 text-lg font-semibold tabular-nums">
                {chip.value}
              </dd>
            </div>
          ))}
        </motion.dl>

        {/* Social proof — one compact line */}
        <motion.div
          {...proofReveal}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 md:mt-12"
        >
          <AvatarStack avatars={HERO_AVATARS} plusLabel="+12k" size={32} />
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-0.5"
              role="img"
              aria-label="Rated 5 out of 5 stars"
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={index}
                  className="h-3.5 w-3.5 fill-white text-white"
                  strokeWidth={0}
                />
              ))}
            </span>
            <p className="text-sm text-muted-foreground">
              Loved by{" "}
              <span className="font-medium text-white">
                {HERO.socialProofCount}
              </span>{" "}
              builders
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Workspace preview — full-bleed, parallax drift, pointer tilt */}
      <motion.div style={{ y: previewY }} className="relative z-0 mt-16 md:mt-24">
        <motion.div {...previewReveal}>
          <div id="workspace" className="scroll-mt-24">
            <TiltFrame max={2.5} className="w-full">
              <WorkspacePreview />
            </TiltFrame>
          </div>
          {/* Subtle monochrome reflection beneath the frame */}
          <div
            aria-hidden="true"
            className="pointer-events-none mx-auto mt-2 h-28 max-w-6xl bg-[radial-gradient(55%_100%_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)] blur-2xl"
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
