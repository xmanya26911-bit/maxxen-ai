"use client";

import { useEffect, useRef } from "react";

interface Star {
  /** Normalized position (0..1), remapped to viewport size each frame. */
  x: number;
  y: number;
  layer: number;
  phase: number;
  speed: number;
  /** Twinkle amplitude — a minority of stars sparkle noticeably. */
  amp: number;
}

/** Depth layers: size in px, base alpha, drift px/s, scroll parallax factor. */
const LAYERS = [
  { count: 70, size: 0.6, alpha: 0.25, drift: 4, parallax: 0.03 },
  { count: 45, size: 1.0, alpha: 0.4, drift: 8, parallax: 0.06 },
  { count: 25, size: 1.6, alpha: 0.7, drift: 14, parallax: 0.1 },
] as const;

/** Larger 4-point DOM sparkles, placed over the hero (first ~110vh) only. */
const SPARKLES = [
  { left: "8%", top: "16%", size: 16, delay: "0.2s" },
  { left: "84%", top: "11%", size: 12, delay: "1.1s" },
  { left: "70%", top: "30%", size: 18, delay: "2.3s" },
  { left: "21%", top: "52%", size: 12, delay: "0.8s" },
  { left: "91%", top: "46%", size: 14, delay: "1.7s" },
  { left: "12%", top: "76%", size: 18, delay: "2.9s" },
  { left: "60%", top: "68%", size: 10, delay: "3.4s" },
  { left: "38%", top: "6%", size: 10, delay: "4.1s" },
] as const;

/**
 * Starfield — fixed full-viewport canvas of ~140 stars across 3 depth layers
 * (0.6/1/1.6px, alpha 0.25/0.4/0.7) with slow diagonal drift, per-star sine
 * twinkle and subtle scroll parallax (scrollY × 0.03/0.06/0.1). DPR-aware,
 * resize-safe (ResizeObserver), rAF loop pauses on document.hidden.
 *
 * Also renders 6-8 larger 4-point SVG sparkles (.animate-twinkle, staggered,
 * white/40) anchored to the top of the document so they live in the hero only.
 *
 * Reduced motion: draws a single static frame, no loop. Background stays the
 * body's black — stars only. The canvas sits at -z-10, above the body
 * background and behind all content.
 */
export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const stars: Star[] = [];
    LAYERS.forEach((layer, layerIndex) => {
      for (let i = 0; i < layer.count; i += 1) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          layer: layerIndex,
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random(),
          amp: Math.random() < 0.3 ? 0.55 : 0.18,
        });
      }
    });

    let width = 0;
    let height = 0;
    let raf = 0;
    let last = performance.now();
    let scrollPos = window.scrollY;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      for (const star of stars) {
        const layer = LAYERS[star.layer];
        const wave = 0.5 + 0.5 * Math.sin(time * 0.001 * star.speed + star.phase);
        ctx.globalAlpha = layer.alpha * (1 - star.amp + star.amp * wave * wave);
        const px = star.x * width;
        const py =
          (((star.y * height - scrollPos * layer.parallax) % height) + height) %
          height;
        ctx.beginPath();
        ctx.arc(px, py, layer.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (time: number) => {
      const dt = Math.min((time - last) / 1000, 0.1);
      last = time;
      for (const star of stars) {
        const layer = LAYERS[star.layer];
        star.x = (star.x + (layer.drift * dt) / Math.max(width, 1)) % 1;
        star.y =
          (star.y + (layer.drift * 0.55 * dt) / Math.max(height, 1)) % 1;
      }
      draw(time);
      raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw(0);
    };

    const onScroll = () => {
      scrollPos = window.scrollY;
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduced) raf = requestAnimationFrame(tick);
    else draw(0);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      />
      {/* Hero-only DOM sparkles: absolute against <html> (position: relative),
          so the layer scrolls away with the hero instead of staying fixed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[110vh] overflow-hidden"
      >
        {SPARKLES.map((sparkle, index) => (
          <svg
            key={index}
            viewBox="0 0 24 24"
            className="animate-twinkle absolute"
            style={{
              left: sparkle.left,
              top: sparkle.top,
              width: sparkle.size,
              height: sparkle.size,
              animationDelay: sparkle.delay,
            }}
          >
            <path
              d="M12 0 L14.4 9.6 L24 12 L14.4 14.4 L12 24 L9.6 14.4 L0 12 L9.6 9.6 Z"
              fill="rgba(255,255,255,0.4)"
            />
          </svg>
        ))}
      </div>
    </>
  );
}
