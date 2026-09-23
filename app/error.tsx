"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen" style={{ background: "var(--mx-bg, #07070d)", color: "#fff", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <p style={{ color: "#8d8d93", fontSize: 12, letterSpacing: ".2em", fontWeight: 700 }}>SOMETHING BROKE</p>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.03em", margin: "12px 0" }}>This view hit an error.</h1>
        <p style={{ color: "#8d8d93", fontSize: 13, lineHeight: 1.6 }}>{error?.message || "The page failed to render."} Nothing was saved or lost by this — try again.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
          <button onClick={() => reset()} className="mx-btn">
            Retry
          </button>
          <a href="/" className="mx-btn-ghost" style={{ textDecoration: "none" }}>
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
