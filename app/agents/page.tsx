"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; app: string; status: string; created: string };

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

function toAccounts(data: any): Account[] {
  const list = Array.isArray(data) ? data : data?.items || data?.accounts || data?.data || data?.connectedAccounts || [];
  if (!Array.isArray(list)) return [];
  return list.map((a: any, i: number) => ({
    id: String(a?.id ?? a?.accountId ?? `row-${i}`),
    app: String(a?.toolkit ?? a?.appName ?? a?.app ?? a?.provider ?? "unknown"),
    status: String(a?.status ?? "connected"),
    created: String(a?.createdAt ?? a?.created_at ?? ""),
  }));
}

export default function Agents() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState("");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const s = ls("maxxen_session");
      if (!s) {
        router.replace("/login");
        return;
      }
      try {
        const r = await fetch("/api/auth/me", { method: "POST", body: JSON.stringify({ session: s }) });
        if (!r.ok) {
          ls("maxxen_session", "__DEL__");
          router.replace("/login");
          return;
        }
      } catch {
        router.replace("/login");
        return;
      }
      const saved = ls("maxxen_composio_key");
      setKey(saved);
      setReady(true);
      if (saved) void refresh(saved);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function refresh(k?: string) {
    const useKey = (k ?? key).trim();
    if (!useKey) {
      setStatus("Paste YOUR Composio API key first — each connected toolkit becomes an agent Maxxen can use.");
      return;
    }
    setLoading(true);
    setStatus("Reading YOUR connected accounts…");
    try {
      const r = await fetch("/api/composio/connect", { method: "POST", body: JSON.stringify({ composioKey: useKey }) });
      const j = await r.json();
      if (j.error) {
        setStatus(j.error);
        setAccounts(null);
      } else {
        ls("maxxen_composio_key", useKey);
        const list = toAccounts(j.connected);
        setAccounts(list);
        setStatus(list.length ? "" : "Key works, but no toolkits connected yet — add them at app.composio.dev, then refresh.");
      }
    } catch (e: any) {
      setStatus(e.message || "Load failed");
      setAccounts(null);
    }
    setLoading(false);
  }

  if (!ready) return <main className="min-h-screen" style={{ background: "var(--mx-bg)" }} />;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--mx-bg)" }}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <a href="/" className="font-black text-lg" style={{ textDecoration: "none", color: "inherit" }}>
          MAXXEN
        </a>
        <span style={{ color: "var(--mx-faint)", fontSize: 12 }}>/ agents</span>
        <a href="/chat" className="mx-btn" style={{ textDecoration: "none", fontSize: 13, padding: "9px 16px", marginLeft: "auto" }}>
          Open Chat →
        </a>
      </header>
      <div className="max-w-5xl mx-auto p-6">
        <h2 style={{ fontSize: "var(--mx-h2)", margin: "8px 0 4px" }}>Your agents</h2>
        <p style={{ color: "var(--mx-muted)", fontSize: 13, margin: "0 0 16px" }}>Every toolkit you connected in YOUR Composio acts as an agent. Nothing here is shared.</p>
        {status && (
          <div className="mx-status" role="status">
            {status}
          </div>
        )}
        <div className="mx-panel">
          <h2>Composio key</h2>
          <p className="sub">Stored only in your browser.</p>
          <div className="body">
            <div className="flex gap-2">
              <input className="mx-field" placeholder="YOUR Composio API key" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Composio API key" />
              <button className="mx-btn" onClick={() => void refresh()} disabled={loading}>
                {loading ? "Reading…" : "Refresh"}
              </button>
            </div>
          </div>
        </div>
        {accounts !== null && accounts.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--mx-border)" }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--mx-border)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mx-success)", boxShadow: "0 0 8px rgba(185,216,189,.7)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{a.app}</div>
                  <div style={{ fontSize: 11, color: "var(--mx-meta)" }}>
                    {a.status}
                    {a.created ? ` · since ${a.created.slice(0, 10)}` : ""} · {a.id.slice(0, 18)}
                  </div>
                </div>
                <a href="/chat" style={{ color: "var(--mx-link)", fontSize: 12 }}>
                  Use in chat →
                </a>
              </div>
            ))}
          </div>
        )}
        {accounts !== null && accounts.length === 0 && !loading && (
          <div className="mx-panel" style={{ marginTop: 16 }}>
            <h2>No agents connected</h2>
            <p className="sub">
              Open <a href="https://app.composio.dev" target="_blank" rel="noreferrer" style={{ color: "var(--mx-link)" }}>app.composio.dev</a> with YOUR key, connect Gmail, GitHub, Notion or Slack — then hit Refresh.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
