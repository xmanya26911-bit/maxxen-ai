"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { WorkflowStepData } from "@/lib/constants";

/**
 * One workflow stage: index number, title, description.
 * Separated by hairline top borders; reveals on viewport entry.
 */
export function WorkflowStep({
  step,
  index,
}: {
  step: WorkflowStepData;
  index: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.article
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: reduced ? 0.01 : 0.6,
        delay: reduced ? 0 : index * 0.08,
        ease: "easeOut",
      }}
      className="border-t border-white/10 pt-6"
    >
      <p className="font-mono text-sm text-muted-foreground">{step.number}</p>
      <h3 className="mt-4 text-xl font-medium tracking-tight text-white">
        {step.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {step.description}
      </p>
    </motion.article>
  );
}
