"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { TESTIMONIAL } from "@/lib/constants";
import { WordReveal } from "./WordReveal";

/**
 * Full-screen testimonial — one large quote, illuminated word by word
 * as the user scrolls, followed by the author row.
 */
export function Testimonial() {
  return (
    <section
      id="showcase"
      aria-labelledby="testimonial-heading"
      className="relative flex min-h-screen flex-col justify-center px-8 py-24 md:px-28 md:py-32"
    >
      <div className="mx-auto w-full max-w-4xl">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          id="testimonial-heading"
          className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          {TESTIMONIAL.eyebrow}
        </motion.p>

        <div className="mt-8 md:mt-12">
          <WordReveal
            text={TESTIMONIAL.quote}
            className="text-4xl font-medium leading-[1.15] tracking-tight md:text-6xl"
            trailing={
              <span className="font-serif italic leading-none text-white/25">
                &rdquo;
              </span>
            }
          />
        </div>

        <motion.figure
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="mt-12 flex items-center gap-4 md:mt-16"
        >
          <Image
            src={TESTIMONIAL.avatar}
            alt={`Portrait of ${TESTIMONIAL.author}`}
            width={56}
            height={56}
            loading="lazy"
            className="h-14 w-14 rounded-full border-2 border-white object-cover"
          />
          <figcaption>
            <p className="font-medium text-white">{TESTIMONIAL.author}</p>
            <p className="text-sm text-muted-foreground">{TESTIMONIAL.role}</p>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
