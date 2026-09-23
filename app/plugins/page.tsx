"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POPULAR = ["gmail", "github", "notion", "slack", "googlecalendar", "googlesheets", "googledrive", "telegram", "vercel", "supabase"];

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

export default function Plugins() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState("");
  const [toolkit, setToolkit] = useState("gmail");
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const s = ls("maxxen_session");
      if (!s) { router.replace("/login"); return; }
      try {
        const r = await fetch("/api/auth/me", { method: "POST", body: JSON.stringify({ session: s }) });
        if (!r.ok) { ls("maxxen_session", "__DEL__"); router.replace("/login"); return; }
      } catch {
        router.replace("/login");
        return;
      }
      setKey(ls("maxxen_composio_key"));
      setReady(true);
    })();
  }, [router]);

  async function check() {
    const useKey = key.trim();
    if (!useKey) {
      setStatus("Paste YOUR Composio API key first — it never leaves your browser.");
      return;
    }
    if (checking) return;
    setChecking(true);
    setStatus(`Checking “${toolkit}” on YOUR account…`);
    try {
      const r = await fetch("/api/composio/connect", { method: "POST", body: JSON.stringify({ composioKey: useKey, toolkit }) });
      const j = await r.json();
      if (j.error) setStatus(j.error);
      else {
        ls("maxxen_composio_key", useKey);
        setStatus(`${j.hint} To add it, connect “${toolkit}” at app.composio.dev, then check again.`);
      }
    } catch (e: any) {
      setStatus(e.message || "Check failed");
    }
    setChecking(false);
  }

  if (!ready) return <main className="min-h-screen" style={{ background: "var(--mx-bg)" }} />;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--mx-bg)" }}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <a href="/" className="font-black text-lg" style={{ textDecoration: "none", color: "inherit" }}>MAXXEN</a>
        <span style={{ color: "var(--mx-faint)", fontSize: 12 }}>/ plugins</span>
        <a href="/chat" className="mx-btn" style={{ textDecoration: "none", fontSize: 13, padding: "9px 16px", marginLeft: "auto" }}>Open Chat →</a>
      </header>
      <div className="max-w-5xl mx-auto p-6">
        <h2 style={{ fontSize: "var(--mx-h2)", margin: "8px 0 4px" }}>Plugin hub</h2>
        <p style={{ color: "var(--mx-muted)", fontSize: 13, margin: "0 0 16px" }}>Connect toolkits on YOUR Composio account. Your key, your plugins, your data.</p>
        {status && <div className="mx-status" role="status">{status}</div>}
        <div className="mx-panel">
          <h2>Your Composio key</h2>
          <p className="sub">Stored only in this browser. Required before anything below works.</p>
          <div className="body">
            <input className="mx-field" placeholder="YOUR Composio API key" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Composio API key" />
          </div>
        </div>
        <div className="mx-panel" style={{ marginTop: 12 }}>
          <h2>Check a toolkit</h2>
          <p className="sub">Type any toolkit slug, or tap one below, then Check.</p>
          <div className="body">
            <div className="flex gap-2">
              <input className="mx-field" placeholder="toolkit slug — e.g. gmail" value={toolkit} onChange={(e) => setToolkit(e.target.value.toLowerCase().trim())} aria-label="Toolkit slug" />
              <button className="mx-btn" onClick={() => void check()} disabled={checking}>{checking ? "Checking…" : "Check"}</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {POPULAR.map((t) => (
                <button key={t} className="mx-btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => setToolkit(t)}>{t}</button>
              ))}
            </div>
            <a href="https://app.composio.dev" target="_blank" rel="noreferrer" style={{ color: "var(--mx-link)", fontSize: 13 }}>Open YOUR Composio dashboard to add toolkits →</a>
          </div>
        </div>
      </div>
    </main>
  );
}