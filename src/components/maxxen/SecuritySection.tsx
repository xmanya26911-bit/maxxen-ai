"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { SECURITY_POINTS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import SplitText from "./motion/SplitText";
import { TerminalLine } from "./HowItWorks";

const TERMINAL_LINES = [
  "$ maxxen login you@mail.com",
  "✓ code sent · expires in 10:00",
  "",
  "$ maxxen chat --byok",
  "✓ keys: browser-only",
  "✓ storage: your-github/maxxen-data",
  "✓ deploy: your-vercel/maxxen",
  "",
  "# your footprint on our servers: nothing.",
] as const;

/** Per-cell hairline borders — correct for both the 1-col and 3-col grids. */
const POINT_BORDERS = [
  "",
  "border-t border-white/[0.08] md:border-l md:border-t-0",
  "border-t border-white/[0.08] md:border-l md:border-t-0",
] as const;

/**
 * SecuritySection (id="security") — the zero-footprint trust manifesto.
 * Giant chrome statement ("We hold nothing."), the architecture terminal
 * (static, blinking cursor) and the three SECURITY_POINTS as hairline columns.
 */
export function SecuritySection() {
  const reduced = useReducedMotion();

  return (
    <section
      id="security"
      aria-labelledby="security-heading"
      className="scroll-mt-20 border-t border-white/[0.06] px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-4xl text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className="bg-glint animate-glint h-1.5 w-1.5 rounded-full"
          />
          Security model
        </motion.p>

        <h2
          id="security-heading"
          className="mt-6 text-5xl font-medium leading-[1.05] tracking-[-0.02em] md:text-7xl"
        >
          <SplitText
            text="We hold nothing."
            by="words"
            leafClassName="text-chrome"
          />
        </h2>

        <motion.p
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground"
        >
          There is no MAXXEN database. No developer backdoor. Your secrets live
          in your browser; your work lives in your GitHub.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="mx-auto mt-12 max-w-2xl rounded-xl border border-white/[0.08] bg-black/60 p-5 text-left font-mono text-[13px] leading-6 md:p-6"
          aria-label="MAXXEN architecture terminal"
        >
          {TERMINAL_LINES.map((line, index) => (
            <TerminalLine
              key={index}
              line={line}
              showCursor={index === TERMINAL_LINES.length - 1}
            />
          ))}
        </motion.div>

        <div className="mx-auto mt-16 grid max-w-4xl md:grid-cols-3">
          {SECURITY_POINTS.map((point, index) => (
            <motion.div
              key={point.title}
              initial={{ opacity: 0, y: reduced ? 0 : 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.6,
                delay: reduced ? 0 : index * 0.1,
                ease: "easeOut",
              }}
              className={cn(
                "px-2 py-6 text-left md:px-8 md:py-2",
                POINT_BORDERS[index]
              )}
            >
              <ShieldCheck
                className="h-5 w-5 text-white/80"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h3 className="mt-4 text-sm font-medium text-white">
                {point.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {point.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
