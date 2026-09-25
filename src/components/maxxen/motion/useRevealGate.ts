"use client";

import { useEffect, useState } from "react";

/** Custom event dispatched by the Preloader the moment its exit begins. */
export const REVEAL_EVENT = "mx:reveal";

/**
 * useRevealGate — coordination signal between the Preloader and above-the-fold
 * hero animations.
 *
 * Returns `true` once the page is visually revealed:
 * - immediately for reduced-motion users and repeat visitors (session-flagged),
 * - otherwise when the Preloader dispatches `mx:reveal` as its curtain lifts.
 *
 * A 3s failsafe guarantees the gate opens even if the Preloader never mounts.
 */
export function useRevealGate(): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let preloaded = false;
    try {
      preloaded = window.sessionStorage.getItem("mx-preloaded") === "1";
    } catch {
      /* storage unavailable — fall through to the event path */
    }
    const openGate = () => setRevealed(true);
    if (reduced || preloaded) {
      openGate();
      return;
    }
    window.addEventListener(REVEAL_EVENT, openGate);
    const failsafe = window.setTimeout(openGate, 3000);
    return () => {
      window.removeEventListener(REVEAL_EVENT, openGate);
      window.clearTimeout(failsafe);
    };
  }, []);

  return revealed;
}
