"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface AvatarStackProps {
  avatars: readonly { src: string; alt: string }[];
  /** Avatar diameter in px (bubble matches). Default 40. */
  size?: number;
  /** Optional trailing bubble label, e.g. "+12k". */
  plusLabel?: string;
  className?: string;
}

/**
 * AvatarStack — overlapping row of monochrome avatars with an optional
 * "+Nk builders" bubble. Avatars spring in with a staggered entrance
 * (transforms gated behind useReducedMotion — opacity only when reduced).
 */
export default function AvatarStack({
  avatars,
  size = 40,
  plusLabel,
  className,
}: AvatarStackProps) {
  const reduced = useReducedMotion();

  const entrance = (index: number) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, scale: 0 },
    animate: { opacity: 1, scale: 1 },
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 20,
      delay: reduced ? 0 : index * 0.07,
    },
  });

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex items-center -space-x-3">
        {avatars.map((avatar, index) => (
          <motion.div
            key={avatar.src}
            {...entrance(index)}
            className="rounded-full ring-2 ring-black"
          >
            <Image
              src={avatar.src}
              alt={avatar.alt}
              width={size}
              height={size}
              style={{ width: size, height: size }}
              className="rounded-full border border-white/25 object-cover"
            />
          </motion.div>
        ))}

        {plusLabel ? (
          <motion.div
            {...entrance(avatars.length)}
            style={{ width: size, height: size }}
            className="flex items-center justify-center rounded-full bg-white/10 text-[11px] font-medium text-white ring-2 ring-black backdrop-blur border border-white/15"
          >
            {plusLabel}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
