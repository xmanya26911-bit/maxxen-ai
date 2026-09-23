"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HtmlFrame } from "../chat/chrome";

type Artifact = { key: string; chatId: string; title: string; lang: string; code: string; path?: string; at: string };

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function timeAgo(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(t).toLocaleDateString();
}

export default function Artifacts() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Artifact[]>([]);
  const [open, setOpen] = useState<string | null>(null);

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
        const chats = JSON.parse(ls("maxxen_chats") || "[]");
        const found: Artifact[] = [];
        const seen = new Set<string>();
        if (Array.isArray(chats)) {
          for (const c of chats) {
            if (!c || !Array.isArray(c.messages)) continue;
            const title = (c.messages.find((x: any) => x?.role === "user")?.content || "Untitled").slice(0, 40);
            for (const m of c.messages as any[]) {
              if (!m || typeof m !== "object") continue;
              const at = typeof m.at === "string" && m.at ? m.at : String(c.at || "");
              const blocks = Array.isArray(m.blocks) ? m.blocks : [];
              for (const b of blocks) {
                if (!b || typeof b.code !== "string" || !b.code.trim()) continue;
                const key = `${b.lang || "txt"}:${hash(b.code)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                found.push({
                  key,
                  chatId: String(c.id || ""),
                  title,
                  lang: String(b.lang || "txt"),
                  code: b.code,
                  path: typeof b.path === "string" ? b.path : undefined,
                  at,
                });
              }
              if (typeof m.html === "string" && m.html.includes("<")) {
                const key = `html:${hash(m.html)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                found.push({ key, chatId: String(c.id || ""), title, lang: "html", code: m.html, path: undefined, at });
              }
            }
          }
        }
        setItems(found.slice(0, 48));
      } catch {
        setItems([]);
      }
      setReady(true);
    })();
  }, [router]);

  const openInChat = (id: string) => {
    if (id) ls("maxxen_open_chat", id);
    router.push("/chat");
  };

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
  };

  if (!ready) return <main className="min-h-screen" style={{ background: "var(--mx-bg)" }} />;

  return (
    <main className="min-h-screen text-white" style={{ background: "var(--mx-bg)" }}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <a href="/" className="font-black text-lg" style={{ textDecoration: "none", color: "inherit" }}>MAXXEN</a>
        <span style={{ color: "var(--mx-faint)", fontSize: 12 }}>/ artifacts</span>
        <a href="/chat" className="mx-btn" style={{ textDecoration: "none", fontSize: 13, padding: "9px 16px", marginLeft: "auto" }}>Open Chat →</a>
      </header>
      <div className="max-w-5xl mx-auto p-6">
        <h2 style={{ fontSize: "var(--mx-h2)", margin: "8px 0 4px" }}>Generated artifacts</h2>
        <p style={{ color: "var(--mx-muted)", fontSize: 13, margin: "0 0 16px" }}>Every code build across your chats — HTML, TSX, CSS, Python and more. Identical regenerations collapse into one.</p>
        {items.length === 0 ? (
          <div className="mx-panel">
            <h2>No artifacts yet</h2>
            <p className="sub">Ask Maxxen to build something in /chat — finished code collects here.</p>
            <div className="body"><div><a href="/chat" className="mx-btn" style={{ textDecoration: "none" }}>Build something →</a></div></div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {items.map((a) => (
              <div key={a.key} style={{ border: "1px solid var(--mx-border)", borderRadius: 12, overflow: "hidden", background: "var(--mx-surface)" }}>
                {a.lang === "html" ? (
                  <HtmlFrame html={a.code} height={150} title={`artifact-${a.key}`} />
                ) : (
                  <pre style={{ margin: 0, height: 150, overflow: "hidden", padding: 12, fontSize: 10, lineHeight: 1.6, color: "#8d8d93", background: "rgba(0,0,0,.4)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, Menlo, monospace" }}>{a.code.slice(0, 600)}</pre>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.path || a.title} <span style={{ color: "var(--mx-meta)", fontWeight: 400 }}>·{a.lang}</span></div>
                  <div style={{ fontSize: 11, color: "var(--mx-meta)", marginTop: 2 }}>{a.at ? timeAgo(a.at) : ""}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="mx-btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => setOpen(open === a.key ? null : a.key)}>{open === a.key ? "Close" : "View"}</button>
                    {a.lang !== "html" && (
                      <button className="mx-btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => copy(a.code)}>Copy</button>
                    )}
                    <button className="mx-btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => openInChat(a.chatId)}>Open in chat</button>
                  </div>
                </div>
                {open === a.key && (a.lang === "html" ? (
                  <HtmlFrame html={a.code} height={420} title={`artifact-full-${a.key}`} framed />
                ) : (
                  <pre style={{ margin: 0, maxHeight: 420, overflow: "auto", padding: 14, fontSize: 11, lineHeight: 1.6, color: "#c9c9cd", background: "rgba(0,0,0,.4)", borderTop: "1px solid var(--mx-border)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, Menlo, monospace" }}>{a.code.slice(0, 20000)}</pre>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
