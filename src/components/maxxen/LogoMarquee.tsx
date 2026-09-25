"use client";

import { motion } from "framer-motion";
import {
  Aperture,
  Box,
  Command,
  Globe,
  Hexagon,
  Layers,
  Triangle,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface Brand {
  name: string;
  Icon: LucideIcon;
  wordmarkClass: string;
}

/* Eight fictional monochrome wordmarks with deliberately varied typography
   so they read as distinct real brands. */
const BRANDS: Brand[] = [
  { name: "STRATUS", Icon: Hexagon, wordmarkClass: "text-sm font-medium uppercase tracking-[0.25em]" },
  { name: "Northloop", Icon: Triangle, wordmarkClass: "font-serif text-xl italic tracking-wide" },
  { name: "HALO LABS", Icon: Command, wordmarkClass: "text-sm font-semibold uppercase tracking-[0.3em]" },
  { name: "Arcadia", Icon: Aperture, wordmarkClass: "font-serif text-xl tracking-[0.08em]" },
  { name: "Fogata", Icon: Layers, wordmarkClass: "text-lg font-semibold tracking-tight" },
  { name: "MONO&CO", Icon: Zap, wordmarkClass: "text-base font-bold uppercase tracking-[0.18em]" },
  { name: "Kite", Icon: Box, wordmarkClass: "font-serif text-lg italic" },
  { name: "Vertex", Icon: Globe, wordmarkClass: "text-sm font-medium uppercase tracking-[0.35em]" },
];

/** One copy of the logo list. The trailing pr equals the row gap so two
    copies + translateX(-50%) loop seamlessly. */
function BrandRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden}
      className="flex shrink-0 items-center gap-16 pr-16 md:gap-20 md:pr-20"
    >
      {BRANDS.map(({ name, Icon, wordmarkClass }) => (
        <div
          key={name}
          className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-white opacity-40 transition-opacity duration-300 hover:opacity-80"
        >
          <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
          <span className={wordmarkClass}>{name}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * LogoMarquee — full-bleed infinite monochrome logo marquee ("Trusted by
 * teams"). Two identical copies animate via the .animate-marquee CSS keyframes
 * (translateX(-50%)), edge-faded with .mask-fade-x and paused on hover via
 * .marquee-hover. The section fades in once on scroll.
 */
export default function LogoMarquee() {
  return (
    <section aria-label="Trusted by teams" className="py-14 md:py-20">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <p className="text-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Powering teams at
        </p>

        <div className="marquee-hover mask-fade-x ml-[calc(-50vw+50%)] mt-8 w-screen overflow-hidden md:mt-10">
          <div className="animate-marquee flex w-max items-center">
            <BrandRow />
            <BrandRow ariaHidden />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
