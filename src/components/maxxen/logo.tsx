import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Chrome MAXXEN emblem (official Y2K logo asset) with a soft glow.
 * Used for nav, hero and the chat experience.
 */
export function ChromeLogo({
  size = 28,
  className,
  glow = false,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 select-none",
        glow && "drop-shadow-[0_0_18px_rgba(255,255,255,0.35)]",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/assets/maxxen-logo.png"
        alt=""
        width={1600}
        height={1600}
        priority
        className="h-full w-full object-contain"
      />
    </span>
  );
}

/**
 * Minimal MAXXEN logo mark — an "M" glyph drawn as a single stroke
 * inside a softly bordered rounded square.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("h-7 w-7 shrink-0", className)}
    >
      <rect width="32" height="32" rx="7" fill="black" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="6.5"
        fill="none"
        stroke="white"
        strokeOpacity="0.18"
      />
      <path
        d="M8.5 22.5V9.5l7.5 8.5 7.5-8.5v13"
        stroke="white"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-xl font-semibold tracking-tight text-white select-none",
        className
      )}
    >
      MAXXEN
    </span>
  );
}
