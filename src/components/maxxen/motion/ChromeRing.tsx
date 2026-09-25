import { useId } from "react";

/**
 * ChromeRing — a thin circular hairline painted with a chrome gradient.
 * Rendered as an SVG stroke (NOT a CSS mask) so it renders identically
 * in every engine. Spin it with .animate-spin-slow, size it via className.
 */
export default function ChromeRing({ className }: { className?: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `mx-ring-${rawId}`;

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="28%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="52%" stopColor="rgba(255,255,255,0.7)" />
          <stop offset="78%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="49.25"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
