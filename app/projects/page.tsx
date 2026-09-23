"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HtmlFrame } from "../chat/chrome";

type Entry = { name: string; path: string; type: string; size: number };
type LocalChat = { id: string; title: string; messages: { role: string; content: string; html?: string }[]; at: string };

const MAX_PREVIEW_BYTES = 500000;

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
  const [path, setPath] = useState("builds");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [preview, setPreview] = useState<{ name: string; html: string } | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadBuilds = useCallback(async (dir: string) => {
    const token = ls("maxxen_github_token");
    if (!token) {
      setStatus("Add YOUR GitHub token on /settings → Storage to see builds saved in YOUR repo.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const r = await fetch("/api/github/list", { method: "POST", body: JSON.stringify({ githubToken: token, path: dir }) });
      const j = await r.json();
      if (j.error) {
        setStatus(j.error);
      } else if (j.empty) {
        setRepo(j.repo);
        setEntries([]);
        if (dir === "builds") setStatus(`Connected to YOUR repo ${j.repo} — no builds saved yet. Generate HTML in /chat and hit Apply.`);
      } else {
        setRepo(j.repo);
        setEntries(j.entries || []);
      }
    } catch (e: any) {
      setStatus(e.message || "Load failed");
    }
    setLoading(false);
  }, []);

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
      try {
        const c = JSON.parse(ls("maxxen_chats") || "[]");
        if (Array.isArray(c)) setChats(c.filter((x) => x && typeof x.title === "string" && Array.isArray(x.messages)));
      } catch {
        setChats([]);
      }
      setReady(true);
      void loadBuilds("builds");
    })();
  }, [router, loadBuilds]);

  useEffect(() => {
    if (!ready) return;
    const onFocus = () => void loadBuilds(path);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ready]);

  const navDir = (dir: string) => {
    setPath(dir);
    setPreview(null);
    void loadBuilds(dir);
  };

  async function openBuild(entry: Entry) {
    if (entry.type === "dir") {
      navDir(entry.path);
      return;
    }
    if (entry.size > MAX_PREVIEW_BYTES) {
      setStatus(`"${entry.name}" is too large to preview (${(entry.size / 1024).toFixed(0)} KB).`);
      return;
    }
    const token = ls("maxxen_github_token");
    if (!token) return;
    setStatus(`Opening ${entry.name}…`);
    try {
      const r = await fetch("/api/github/list", { method: "POST", body: JSON.stringify({ githubToken: token, path: entry.path }) });
      const j = await r.json();
      if (j.file?.text) {
        setPreview({ name: entry.name, html: j.file.text });
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

  const crumbs = path.split("/").filter(Boolean);

  if (!ready) return <main className="min-h-screen" style={{ background: "var(--mx-bg)" }} />;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--mx-bg)" }}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <a href="/" className="font-black text-lg" style={{ textDecoration: "none", color: "inherit" }}>MAXXEN</a>
        <span style={{ color: "var(--mx-faint)", fontSize: 12 }}>/ projects</span>
        <button className="mx-btn-ghost" style={{ fontSize: 12, padding: "8px 14px", marginLeft: "auto" }} onClick={() => void loadBuilds(path)}>Refresh</button>
        <a href="/chat" className="mx-btn" style={{ textDecoration: "none", fontSize: 13, padding: "9px 16px" }}>Open Chat →</a>
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
        <h2 style={{ fontSize: "var(--mx-h2)", margin: "32px 0 4px" }}>Files {repo && <span style={{ color: "var(--mx-meta)", fontSize: 12, fontWeight: 400 }}>{repo}</span>}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--mx-muted)", margin: "0 0 12px" }}>
          <button className="mx-btn-ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => navDir("")}>maxxen-data</button>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>/</span>
              <button className="mx-btn-ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => navDir(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
            </span>
          ))}
        </div>
        {loading && <p style={{ color: "var(--mx-muted)", fontSize: 13 }}>Loading YOUR repo…</p>}
        {entries !== null && entries.length === 0 && !loading && (
          <div className="mx-panel">
            <h2>Nothing here yet</h2>
            <p className="sub">Builds you Apply in /chat land under builds/.</p>
          </div>
        )}
        {entries !== null && entries.length > 0 && (
          <div style={{ borderTop: "1px solid var(--mx-border)" }}>
            {entries.map((e) => (
              <div key={e.path} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--mx-border)" }}>
                <span style={e.type === "dir" ? { width: 10, height: 8, border: "1px solid var(--mx-link)", borderRadius: 1, opacity: 0.8 } : { width: 8, height: 10, border: "1px solid var(--mx-faint)", borderRadius: 1, opacity: 0.7 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: "var(--mx-meta)" }}>{e.type === "dir" ? "folder" : `${(e.size / 1024).toFixed(1)} KB`} · {e.path}</div>
                </div>
                <button className="mx-btn-ghost" onClick={() => void openBuild(e)}>{e.type === "dir" ? "Open" : "Preview"}</button>
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
            <HtmlFrame html={preview.html} height={480} title={`build-${preview.name}`} framed />
          </div>
        )}
      </div>
    </main>
  );
}