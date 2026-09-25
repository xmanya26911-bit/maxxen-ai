"use client";

import { motion } from "framer-motion";
import { PHILOSOPHY, WORKFLOW_STEPS } from "@/lib/constants";
import { WorkflowStep } from "./WorkflowStep";

/**
 * Product philosophy — the MAXXEN workflow:
 * Think → Build → Iterate → Ship.
 */
export function ProductPhilosophy() {
  return (
    <section
      id="agents"
      aria-labelledby="philosophy-heading"
      className="relative border-t border-white/[0.06] px-6 py-24 md:px-16 md:py-32 lg:px-28"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <h2
            id="philosophy-heading"
            className="max-w-3xl text-4xl font-medium leading-[1.1] tracking-tight text-white md:text-5xl"
          >
            {PHILOSOPHY.headline}
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {PHILOSOPHY.supporting}
          </p>
        </motion.div>

        <div className="mt-16 grid gap-10 sm:grid-cols-2 md:mt-20 lg:grid-cols-4 lg:gap-8">
          {WORKFLOW_STEPS.map((step, index) => (
            <WorkflowStep key={step.number} step={step} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
