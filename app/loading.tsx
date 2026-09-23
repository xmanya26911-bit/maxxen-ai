export default function Loading() {
  return (
    <main className="min-h-screen" style={{ background: "var(--mx-bg, #07070d)", color: "#fff", display: "grid", placeItems: "center" }}>
      <div style={{ width: "min(420px, 90vw)", display: "grid", gap: 10 }} aria-label="Loading">
        {[82, 64, 41].map((w, i) => (
          <div
            key={i}
            style={{
              height: 12,
              width: `${w}%`,
              borderRadius: 6,
              background: "linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.12) 50%, rgba(255,255,255,.05) 75%)",
              backgroundSize: "200% 100%",
              animation: "mx-global-shimmer 1.4s linear infinite",
            }}
          />
        ))}
        <style>{`@keyframes mx-global-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    </main>
  );
}
