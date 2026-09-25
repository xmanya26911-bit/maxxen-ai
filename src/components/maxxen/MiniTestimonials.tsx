"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";

interface MiniTestimonial {
  quote: string;
  name: string;
  role: string;
  avatar: string;
}

const TESTIMONIALS: MiniTestimonial[] = [
  {
    quote:
      "The first tool where my agents, editor, and preview live in the same place. I shipped our whole marketing site in an afternoon.",
    name: "Priya Sharma",
    role: "Design Engineer, Loopcraft",
    avatar: "/assets/avatars/avatar-3.png",
  },
  {
    quote:
      "MAXXEN feels less like an assistant and more like a senior engineer sitting next to me. The iteration loop is unreal.",
    name: "Daniel Kim",
    role: "Indie Hacker",
    avatar: "/assets/avatars/avatar-4.png",
  },
  {
    quote:
      "We replaced four subscriptions the week we onboarded. Our CTO reviews PRs and our designers ship now.",
    name: "Sofia Reyes",
    role: "CTO, Northloop",
    avatar: "/assets/avatars/avatar-5.png",
  },
];

/** Writes the pointer position into --spot-x/--spot-y for the spotlight overlay. */
function handleSpotlightMove(event: React.MouseEvent<HTMLDivElement>) {
  const { clientX, clientY, currentTarget } = event;
  const rect = currentTarget.getBoundingClientRect();
  currentTarget.style.setProperty("--spot-x", `${clientX - rect.left}px`);
  currentTarget.style.setProperty("--spot-y", `${clientY - rect.top}px`);
}

/**
 * MiniTestimonials — grid of three compact quote cards with a mouse-following
 * monochrome spotlight (fine-pointer devices only). Cards stagger in on
 * scroll; reduced motion keeps opacity and drops the y-transform.
 */
export default function MiniTestimonials() {
  const reduced = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine)");
    const sync = () => setFinePointer(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <section aria-label="More from builders" className="mx-auto max-w-6xl px-6">
      <div className="grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((testimonial, index) => (
          <motion.div
            key={testimonial.name}
            initial={{ opacity: 0, y: reduced ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.6,
              delay: reduced ? 0 : index * 0.12,
              ease: "easeOut",
            }}
            onMouseMove={finePointer ? handleSpotlightMove : undefined}
            style={{ "--spot-x": "50%", "--spot-y": "0%" } as React.CSSProperties}
            className="relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
          >
            {/* Mouse spotlight — follows --spot-x/--spot-y */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(180px_circle_at_var(--spot-x)_var(--spot-y),rgba(255,255,255,0.06),transparent)]"
            />

            <div
              role="img"
              aria-label="Rated 5 out of 5 stars"
              className="relative flex gap-1 opacity-70"
            >
              {Array.from({ length: 5 }).map((_, starIndex) => (
                <Star
                  key={starIndex}
                  size={12}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="fill-white text-white"
                />
              ))}
            </div>

            <blockquote className="relative mt-4 text-[15px] leading-7 text-foreground/90">
              <span
                aria-hidden="true"
                className="mr-1.5 font-serif text-[22px] italic leading-none text-white/35"
              >
                &ldquo;
              </span>
              {testimonial.quote}
            </blockquote>

            <div className="relative mt-6 flex items-center gap-3">
              <Image
                src={testimonial.avatar}
                alt={testimonial.name}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full border border-white/20 object-cover"
              />
              <div>
                <p className="text-sm font-medium text-white">{testimonial.name}</p>
                <p className="text-xs text-muted-foreground">{testimonial.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
