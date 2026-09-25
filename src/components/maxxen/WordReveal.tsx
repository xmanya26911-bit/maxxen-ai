"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface WordProps {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
}

/** A single word, illuminated sequentially as scroll progress passes its range. */
function Word({ children, progress, range }: WordProps) {
  const opacity = useTransform(progress, range, [0.2, 1]);
  const color = useTransform(progress, range, ["hsl(0 0% 35%)", "hsl(0 0% 100%)"]);

  return (
    <motion.span
      style={{ opacity, color }}
      className="mr-[0.3em] inline-block last:mr-0"
    >
      {children}
    </motion.span>
  );
}

/**
 * Generic scroll-linked word reveal.
 * Splits `text` into words and maps each to its own sequential interval of
 * the container's scroll progress: ["start end", "end center"].
 * Reduced motion renders static, fully legible text.
 */
export function WordReveal({
  text,
  className,
  trailing,
}: {
  text: string;
  className?: string;
  trailing?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLParagraphElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end center"],
  });

  const words = text.split(" ");

  if (prefersReducedMotion) {
    return (
      <p ref={containerRef} className={cn("relative", className)}>
        {text}
        {trailing ? <span className="whitespace-pre"> </span> : null}
        {trailing}
      </p>
    );
  }

  return (
    <p
      ref={containerRef}
      className={cn("relative flex flex-wrap", className)}
    >
      {words.map((word, i) => {
        const start = i / words.length;
        const end = (i + 1) / words.length;
        return (
          <Word
            key={`${word}-${i}`}
            progress={scrollYProgress}
            range={[start, end]}
          >
            {word}
          </Word>
        );
      })}
      {trailing ? (
        <span aria-hidden="true" className="inline-block">
          {trailing}
        </span>
      ) : null}
    </p>
  );
}
