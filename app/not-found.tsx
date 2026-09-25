"use client";
import { useEffect, useRef } from "react";
export default function NotFound() {
  const hRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { hRef.current?.focus(); }, []);
  return (
    <main className="min-h-screen" style={{ background: "var(--mx-bg, #09090a)", color: "#fff", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <p style={{ color: "var(--mx-faint)", fontSize: 12, letterSpacing: ".2em", fontWeight: 700 }}>404</p>
        <h1 ref={hRef} tabIndex={-1} style={{ fontSize: 26, letterSpacing: "-0.03em", margin: "12px 0", outline: "none" }}>No page here.</h1>
        <p style={{ color: "var(--mx-muted)", fontSize: 13, lineHeight: 1.6 }}>The address doesn&apos;t match anything in Maxxen.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
          <a href="/chat" className="mx-btn" style={{ textDecoration: "none" }}>Open chat</a>
          <a href="/" className="mx-btn-ghost" style={{ textDecoration: "none" }}>Go home</a>
        </div>
      </div>
    </main>
  );
}