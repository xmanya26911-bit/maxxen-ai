"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Artifact = { chatId: string; title: string; html: string; at: string };

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

export default function Artifacts() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Artifact[]>([]);
  const [open, setOpen] = useState<string | null>(null);

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
        const chats = JSON.parse(ls("maxxen_chats") || "[]");
        const found: Artifact[] = [];
        if (Array.isArray(chats)) {
          for (const c of chats) {
            if (!c || !Array.isArray(c.messages)) continue;
            c.messages.forEach((m: any) => {
              if (m && typeof m.html === "string" && m.html.includes("<")) {
                const firstUser = (c.messages.find((x: any) => x?.role === "user")?.content || "Untitled").slice(0, 40);
                found.push({ chatId: String(c.id || ""), title: firstUser, html: m.html, at: String(c.at || "") });
              }
            });
          }
        }
        setItems(found.slice(0, 24));
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
        <p style={{ color: "var(--mx-muted)", fontSize: 13, margin: "0 0 16px" }}>Every HTML build the AI produced in your chats, in this browser.</p>
        {items.length === 0 ? (
          <div className="mx-panel">
            <h2>No artifacts yet</h2>
            <p className="sub">Ask Maxxen to build a landing page, dashboard or app in /chat — finished builds collect here.</p>
            <div className="body"><div><a href="/chat" className="mx-btn" style={{ textDecoration: "none" }}>Build something →</a></div></div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {items.map((a, i) => (
              <div key={`${a.chatId}-${i}`} style={{ border: "1px solid var(--mx-border)", borderRadius: 12, overflow: "hidden", background: "var(--mx-surface)" }}>
                <iframe title={`artifact-${i}`} srcDoc={a.html} sandbox="allow-scripts" style={{ width: "100%", height: 150, border: 0, background: "#fff", pointerEvents: "none" }} />
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="mx-btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => setOpen(open === `${a.chatId}-${i}` ? null : `${a.chatId}-${i}`)}>{open === `${a.chatId}-${i}` ? "Close" : "View"}</button>
                    <button className="mx-btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => openInChat(a.chatId)}>Open in chat</button>
                  </div>
                </div>
                {open === `${a.chatId}-${i}` && (
                  <iframe title={`artifact-full-${i}`} srcDoc={a.html} sandbox="allow-scripts" style={{ width: "100%", height: 420, border: 0, borderTop: "1px solid var(--mx-border)", background: "#fff" }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}