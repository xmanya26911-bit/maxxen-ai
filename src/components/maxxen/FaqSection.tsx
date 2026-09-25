"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import SplitText from "./motion/SplitText";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * FaqSection (id="faq") — "Asked often." with a custom accordion over
 * FAQ_ITEMS: AnimatePresence height animation, rotating Plus icon, hairline
 * rows. The first question starts open; reduced motion skips transforms.
 */
export function FaqSection() {
  const reduced = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 border-t border-white/[0.06] px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <h2
          id="faq-heading"
          className="text-4xl font-medium tracking-tight md:text-5xl"
        >
          <SplitText text="Asked" />{" "}
          <SplitText
            text="often."
            by="words"
            delay={0.14}
            className="font-serif font-normal italic tracking-[-0.01em]"
            leafClassName="text-chrome"
          />
        </h2>

        <div className="mt-10 border-t border-white/[0.08] md:mt-12">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={item.q} className="border-b border-white/[0.08]">
                <button
                  type="button"
                  id={`faq-trigger-${index}`}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  className={cn(
                    "mx-focus flex w-full items-center justify-between gap-6 rounded-md py-5 text-left transition-colors hover:text-white/80",
                    isOpen ? "text-white" : "text-white/90"
                  )}
                >
                  <span className="text-base font-medium md:text-lg">
                    {item.q}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: reduced ? 0 : 0.25, ease: EASE }}
                    className="shrink-0 text-muted-foreground"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${index}`}
                      role="region"
                      aria-labelledby={`faq-trigger-${index}`}
                      initial={{ height: 0, opacity: reduced ? 1 : 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: reduced ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pr-8 text-sm leading-6 text-muted-foreground md:text-[15px]">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
