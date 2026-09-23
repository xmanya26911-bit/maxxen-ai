"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Entry = { name: string; path: string; type: string; size: number };
type LocalChat = { id: string; title: string; messages: { role: string; content: string; html?: string }[]; at: string };

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

export default function Projects() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [repo, setRepo] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [preview, setPreview] = useState<{ name: string; html: string } | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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
      try {
        const c = JSON.parse(ls("maxxen_chats") || "[]");
        if (Array.isArray(c)) setChats(c.filter((x) => x && typeof x.title === "string" && Array.isArray(x.messages)));
      } catch {
        setChats([]);
      }
      setReady(true);
      void loadBuilds();
    })();
  }, [router]);

  async function loadBuilds() {
    const token = ls("maxxen_github_token");
    if (!token) {
      setStatus("Add YOUR GitHub token on /settings → Storage to see builds saved in YOUR repo.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const r = await fetch("/api/github/list", { method: "POST", body: JSON.stringify({ githubToken: token, path: "builds" }) });
      const j = await r.json();
      if (j.error) {
        setStatus(j.error);
      } else if (j.empty) {
        setRepo(j.repo);
        setEntries([]);
        setStatus(`Connected to YOUR repo ${j.repo} — no builds saved yet. Generate HTML in /chat and hit Apply.`);
      } else {
        setRepo(j.repo);
        setEntries((j.entries || []).filter((e: Entry) => e.type === "file"));
      }
    } catch (e: any) {
      setStatus(e.message || "Load failed");
    }
    setLoading(false);
  }

  async function openBuild(path: string, name: string) {
    const token = ls("maxxen_github_token");
    if (!token) return;
    setStatus(`Opening ${name}…`);
    try {
      const r = await fetch("/api/github/list", { method: "POST", body: JSON.stringify({ githubToken: token, path }) });
      const j = await r.json();
      if (j.file?.text) {
        setPreview({ name, html: j.file.text });
        setStatus("");
      } else setStatus("Couldn't preview that file (empty or binary).");
    } catch (e: any) {
      setStatus(e.message || "Open failed");
    }
  }

  const openInChat = (id: string) => {
    ls("maxxen_open_chat", id);
    router.push("/chat");
  };

  if (!ready) return <main className="min-h-screen" style={{ background: "var(--mx-bg)" }} />;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--mx-bg)" }}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <a href="/" className="font-black text-lg" style={{ textDecoration: "none", color: "inherit" }}>MAXXEN</a>
        <span style={{ color: "var(--mx-faint)", fontSize: 12 }}>/ projects</span>
        <a href="/chat" className="mx-btn" style={{ textDecoration: "none", fontSize: 13, padding: "9px 16px", marginLeft: "auto" }}>Open Chat →</a>
      </header>
      <div className="max-w-5xl mx-auto p-6">
        {status && <div className="mx-status" role="status">{status}</div>}
        <h2 style={{ fontSize: "var(--mx-h2)", margin: "8px 0 4px" }}>Conversations</h2>
        <p style={{ color: "var(--mx-muted)", fontSize: 13, margin: "0 0 12px" }}>Saved in this browser. Continue any of them in /chat.</p>
        {chats.length === 0 ? (
          <div className="mx-panel">
            <h2>No conversations yet</h2>
            <p className="sub">Start chatting in /chat — everything you build is listed here automatically.</p>
            <div className="body"><div><a href="/chat" className="mx-btn" style={{ textDecoration: "none" }}>Start a chat →</a></div></div>
          </div>
        ) : (
          <div style={{ borderTop: "1px solid var(--mx-border)" }}>
            {chats.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--mx-border)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: "var(--mx-meta)" }}>{c.messages.length} messages · {new Date(c.at).toLocaleString()}</div>
                </div>
                <button className="mx-btn-ghost" onClick={() => openInChat(c.id)}>Continue →</button>
              </div>
            ))}
          </div>
        )}
        <h2 style={{ fontSize: "var(--mx-h2)", margin: "32px 0 4px" }}>Saved builds {repo && <span style={{ color: "var(--mx-meta)", fontSize: 12, fontWeight: 400 }}>{repo}/builds</span>}</h2>
        <p style={{ color: "var(--mx-muted)", fontSize: 13, margin: "0 0 12px" }}>Single-file HTML you Applied from /chat — stored in YOUR GitHub.</p>
        {loading && <p style={{ color: "var(--mx-muted)", fontSize: 13 }}>Loading YOUR repo…</p>}
        {entries !== null && entries.length === 0 && !loading && (
          <div className="mx-panel">
            <h2>Nothing saved yet</h2>
            <p className="sub">Builds you Apply in /chat land here.</p>
          </div>
        )}
        {entries !== null && entries.length > 0 && (
          <div style={{ borderTop: "1px solid var(--mx-border)" }}>
            {entries.map((e) => (
              <div key={e.path} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--mx-border)" }}>
                <span style={{ width: 8, height: 10, border: "1px solid var(--mx-faint)", borderRadius: 1, opacity: 0.7 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: "var(--mx-meta)" }}>{(e.size / 1024).toFixed(1)} KB · {e.path}</div>
                </div>
                <button className="mx-btn-ghost" onClick={() => void openBuild(e.path, e.name)}>Preview</button>
              </div>
            ))}
          </div>
        )}
        {preview && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <b style={{ fontSize: 14 }}>{preview.name}</b>
              <button className="mx-btn-ghost" onClick={() => setPreview(null)}>Close</button>
            </div>
            <iframe title={`build-${preview.name}`} srcDoc={preview.html} sandbox="allow-scripts" style={{ width: "100%", height: 480, border: "1px solid var(--mx-border-strong)", borderRadius: 12, background: "#fff" }} />
          </div>
        )}
      </div>
    </main>
  );
}