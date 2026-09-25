"use client";

import { useRef } from "react";
import {
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Cinematic hero parallax.
 *
 * - Content drifts up and fades out across the first half of the hero exit.
 * - The workspace preview drifts up more slowly, creating depth.
 * - Disabled (zero offsets) for users who prefer reduced motion.
 */
export function useHeroParallax(): {
  sectionRef: React.RefObject<HTMLElement | null>;
  contentY: MotionValue<number>;
  contentOpacity: MotionValue<number>;
  previewY: MotionValue<number>;
  prefersReducedMotion: boolean;
} {
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const contentY = useTransform(
    scrollYProgress,
    [0, 0.5],
    [0, prefersReducedMotion ? 0 : -200]
  );
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const previewY = useTransform(
    scrollYProgress,
    [0, 1],
    [0, prefersReducedMotion ? 0 : -250]
  );

  return {
    sectionRef,
    contentY,
    contentOpacity,
    previewY,
    prefersReducedMotion,
  };
}
