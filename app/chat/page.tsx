"use client";
import { useEffect, useRef, useState } from "react";
import "./chat-a.css";
import "./chat-b.css";

type Msg = { role: "user" | "assistant"; content: string; html?: string; at: string };
type SavedChat = { id: string; title: string; messages: Msg[]; at: string };

const nav = ["Home", "Chats", "Projects", "Artifacts", "Agents", "Plugins"];
const navIcons = ["home", "chat", "grid", "box", "bolt", "grid"];
const tools = ["Chat", "Build", "Code", "Design", "Research", "Deploy"];
const suggestions = ["Build a landing page", "Create a dashboard", "Design an app", "Connect an API"];
const MODELS = [
  { id: "openai", glyph: "◈", label: "GPT-4o-mini", sub: "ChatGPT · BYOK", model: "gpt-4o-mini" },
  { id: "gemini", glyph: "✶", label: "Gemini Flash", sub: "Gemini · BYOK", model: "gemini-1.5-flash" },
];

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function Marble({ className }: { className: string }) {
  return <span className={`marble ${className}`} aria-hidden="true" />;
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    plus: "M12 5v14M5 12h14",
    search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    home: "m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Zm6 12v-8h6v8",
    chat: "M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v8Z",
    grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
    bolt: "m13 2-9 12h7l-1 8 9-12h-7l1-8Z",
    box: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5-8 4.5-8-4.5",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.5 7.5 0 0 0-.1-1.1l2-1.5-2-3.5-2.4 1a8.7 8.7 0 0 0-1.8-1L14.8 3h-4l-.4 2.9a8.7 8.7 0 0 0-1.8 1l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2.2l-2 1.5 2 3.5 2.4-1a8.7 8.7 0 0 0 1.8 1l.4 2.9h4l.4-2.9a8.7 8.7 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.4.1-.7.1-1.1Z",
    paperclip: "m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.7 17.7a2 2 0 0 1-2.8-2.8l8.5-8.5",
    send: "m22 2-7 20-4-9-9-4 20-7Zm-11 11 4-4",
    code: "m8 9-3 3 3 3m8-6 3 3-3 3m-3-8-2 10",
    eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    chevron: "m7 10 5 5 5-5",
    close: "M6 6l12 12M18 6 6 18",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

export default function ChatPage() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState("");
  const [email, setEmail] = useState("");
  const [activeTool, setActiveTool] = useState("Chat");
  const [contextOpen, setContextOpen] = useState(true);
  const [modelOpen, setModelOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [activeNav, setActiveNav] = useState("Chats");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [attach, setAttach] = useState<{ name: string; text: string } | null>(null);
  const [recent, setRecent] = useState<SavedChat[]>([]);
  const [chatId, setChatId] = useState(() => String(Date.now()));
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");

  useEffect(() => {
    setSession(ls("maxxen_session"));
    setEmail(ls("maxxen_otp_email"));
    setProvider(ls("maxxen_provider") || "openai");
    const m = ls("maxxen_model");
    setModel(m || (ls("maxxen_provider") === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini"));
    try {
      setRecent(JSON.parse(ls("maxxen_chats") || "[]"));
    } catch {
      setRecent([]);
    }
    setReady(true);
  }, []);

  const persistRecent = (msgs: Msg[], id: string) => {
    if (!msgs.length) return;
    const title = (msgs.find((m) => m.role === "user")?.content || "Untitled").slice(0, 42);
    setRecent((prev) => {
      const next = [{ id, title, messages: msgs, at: new Date().toISOString() }, ...prev.filter((c) => c.id !== id)].slice(0, 8);
      ls("maxxen_chats", JSON.stringify(next));
      return next;
    });
  };

  const activeKey = () => (provider === "gemini" ? ls("maxxen_gemini_key") : ls("maxxen_openai_key"));

  const send = async (text?: string) => {
    const raw = (text ?? prompt).trim();
    if (!raw || sending) return;
    const key = activeKey();
    if (!key) {
      setStatus("Add your Gemini or OpenAI key on the home Settings tab first (BYOK) — then chat here.");
      return;
    }
    let full = raw;
    if (attach) full += `\n\n[Attached file: ${attach.name}]\n\`\`\`\n${attach.text.slice(0, 6000)}\n\`\`\``;
    const userMsg: Msg = { role: "user", content: full, at: "Just now" };
    const next = [...messages, userMsg];
    setMessages(next);
    setPrompt("");
    setAttach(null);
    setSending(true);
    setStatus("");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          provider,
          apiKey: key,
          baseURL: ls("maxxen_baseurl"),
          model: model || undefined,
        }),
      });
      const j = await r.json();
      if (j.error) {
        setStatus(j.error);
      } else {
        const reply = String(j.reply || "");
        const m = reply.match(/```html([\s\S]*?)```/i);
        const done = [...next, { role: "assistant", content: reply, html: m ? m[1].trim() : undefined, at: "Just now" } as Msg];
        setMessages(done);
        persistRecent(done, chatId);
      }
    } catch (e: any) {
      setStatus(e.message || "Send failed");
    }
    setSending(false);
  };

  const newChat = () => {
    if (messages.length) persistRecent(messages, chatId);
    setMessages([]);
    setPrompt("");
    setAttach(null);
    setExpanded(null);
    setStatus("");
    setChatId(String(Date.now()));
  };

  const openChat = (c: SavedChat) => {
    if (messages.length) persistRecent(messages, chatId);
    setMessages(c.messages);
    setChatId(c.id);
    setExpanded(null);
    setStatus("");
  };

  const onAttach = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200 * 1024) {
      setStatus("File too large for attach (200KB max) — paste the relevant part instead.");
      return;
    }
    const text = await f.text().catch(() => "");
    if (!text.trim()) {
      setStatus("Couldn't read that file as text.");
      return;
    }
    setAttach({ name: f.name, text });
  };

  const saveToGithub = async (html: string) => {
    const token = ls("maxxen_github_token");
    if (!token) {
      setStatus("Paste YOUR GitHub token on the home Storage tab first — then Apply saves there.");
      return;
    }
    setStatus("Saving to YOUR GitHub…");
    const r = await fetch("/api/github/save", {
      method: "POST",
      body: JSON.stringify({ githubToken: token, path: `builds/${chatId}.html`, content: html, message: "maxxen: save build from /chat" }),
    });
    const j = await r.json();
    setStatus(j.ok ? `Saved to YOUR repo: ${j.repo}/${j.path}` : j.error || "Save failed");
  };

  const initials = (email || "MX").slice(0, 2).toUpperCase();
  const currentModel = MODELS.find((m) => m.id === provider) || MODELS[0];
  const latestHtml = [...messages].reverse().find((m) => m.html)?.html;
  const hasMessages = messages.length > 0;

  if (!ready) return <main className="app-shell" />;
  if (!session)
    return (
      <main className="app-shell" style={{ placeItems: "center", display: "grid", gridTemplateColumns: "1fr" }}>
        <div style={{ textAlign: "center" }}>
          <p className="eyebrow">MAXXEN AI</p>
          <h1 style={{ fontSize: 40, letterSpacing: "-0.05em" }}>
            Log in to <em style={{ fontFamily: "'Bodoni Moda', Georgia, serif" }}>chat</em>.
          </h1>
          <p className="intro">Verify your email first — it takes 10 seconds.</p>
          <a href="/" className="quiet-button" style={{ textDecoration: "none", display: "inline-block", lineHeight: "30px" }}>
            Go to login
          </a>
        </div>
      </main>
    );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <Mark />
          <span>MAXXEN</span>
        </a>
        <button className="new-chat" onClick={newChat}>
          <Icon name="plus" /> New chat <kbd>⌘ K</kbd>
        </button>
        <button className="search" onClick={() => setActiveNav("Chats")}>
          <Icon name="search" /> Search <kbd>⌘ /</kbd>
        </button>
        <nav>
          {nav.map((item, i) =>
            item === "Home" ? (
              <a key={item} href="/" className="nav-item" style={{ textDecoration: "none" }}>
                <Icon name={navIcons[i]} />
                {item}
              </a>
            ) : (
              <button key={item} onClick={() => setActiveNav(item)} className={`nav-item ${activeNav === item ? "active" : ""}`}>
                <Icon name={navIcons[i]} />
                {item}
              </button>
            )
          )}
        </nav>
        <section className="recent">
          <p>Recent</p>
          {recent.length === 0 && <span style={{ fontSize: 10, color: "#5f5f66" }}>No chats yet</span>}
          {recent.map((c) => (
            <button key={c.id} onClick={() => openChat(c)} title={c.title}>
              {c.title}
            </button>
          ))}
        </section>
        <div className="account">
          <div className="avatar">{initials}</div>
          <div>
            <strong>{email || "Maxxen user"}</strong>
            <span>BYOK workspace</span>
          </div>
          <a href="/" aria-label="Settings" style={{ marginLeft: "auto", color: "#6f6f75", padding: 4 }}>
            <Icon name="settings" />
          </a>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb">
            <span>MAXXEN</span>
            <b>/</b>
            <strong>{hasMessages ? (messages.find((m) => m.role === "user")?.content.slice(0, 32) || "Chat") : "Untitled workspace"}</strong>
            <Icon name="chevron" size={14} />
          </div>
          <div className="top-actions">
            <div className="model-wrap">
              <button className="model" onClick={() => setModelOpen(!modelOpen)}>
                <span className="model-glyph">✦</span> {currentModel.label} <Icon name="chevron" size={14} />
              </button>
              {modelOpen && (
                <div className="model-menu">
                  <small>SELECT MODEL (BYOK)</small>
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setProvider(m.id);
                        setModel(m.model);
                        ls("maxxen_provider", m.id);
                        ls("maxxen_model", m.model);
                        setModelOpen(false);
                      }}
                    >
                      {m.glyph} {m.label} <b>{provider === m.id ? "Current" : m.sub}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="ready">
              <i /> Ready
            </span>
            <button
              className="quiet-button"
              onClick={() => {
                const txt = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n");
                if (txt) navigator.clipboard?.writeText(txt).catch(() => {});
                setStatus("Transcript copied — paste it anywhere.");
              }}
            >
              Share
            </button>
            <button className="icon-button" onClick={newChat} aria-label="More">
              <Icon name="more" />
            </button>
          </div>
        </header>

        <div className={`stage ${hasMessages ? "has-message" : ""}`}>
          <Marble className="marble-one" />
          <Marble className="marble-two" />
          <Marble className="marble-three" />
          {!hasMessages ? (
            <div className="welcome">
              <p className="eyebrow">YOUR DEVELOPMENT ENVIRONMENT</p>
              <h1>
                BUILD SOMETHING
                <br />
                <em>remarkable</em>
                <br />
                DIFFERENT<span>.</span>
              </h1>
              <p className="intro">
                Describe what you want to create. MAXXEN will design, build,
                <br className="desktop" /> refine, and deploy it with you.
              </p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                    <span>↗</span>
                  </button>
                ))}
              </div>
              {status && (
                <p className="intro" style={{ color: "#e0a0a0" }}>
                  {status}
                </p>
              )}
            </div>
          ) : (
            <div className="conversation">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div className="message user-message" key={i}>
                    <div className="message-avatar">{initials}</div>
                    <div>
                      <p style={{ whiteSpace: "pre-wrap" }}>{m.content.length > 1200 ? m.content.slice(0, 1200) + "…" : m.content}</p>
                      <small>{m.at}</small>
                    </div>
                  </div>
                ) : (
                  <div className="message assistant-message" key={i}>
                    <div className="assistant-mark">
                      <Mark />
                    </div>
                    <div className="assistant-copy">
                      {sending && i === messages.length - 1 && (
                        <p className="thinking">
                          <i /> Thinking through your request
                        </p>
                      )}
                      <h2>{m.content.split("\n").find((l) => l.trim())?.slice(0, 140) || "Here's what I built"}</h2>
                      <p style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#c9c9cd", lineHeight: 1.6 }}>{m.content.slice(0, 2000)}</p>
                      {m.html && (
                        <div className="artifact" style={{ marginTop: 18 }}>
                          <div className="artifact-visual">
                            <b>MAXXEN</b>
                            <strong>
                              BUILT
                              <br />
                              FOR THE
                              <br />
                              <i>DIFFERENT.</i>
                            </strong>
                          </div>
                          <div>
                            <p>ARTIFACT</p>
                            <h3>Generated build</h3>
                            <span>Single-file HTML · live preview</span>
                            <div>
                              <button onClick={() => setExpanded(expanded === i ? null : i)}>
                                Open preview <Icon name="eye" size={14} />
                              </button>
                              <button className="apply" onClick={() => m.html && saveToGithub(m.html)}>
                                Apply changes
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {m.html && expanded === i && (
                        <iframe title={`preview-${i}`} srcDoc={m.html} style={{ width: "100%", height: 420, border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, marginTop: 12, background: "#fff" }} />
                      )}
                      <small>{m.at}</small>
                    </div>
                  </div>
                )
              )}
              {sending && <p className="thinking" style={{ marginTop: 24 }}>…</p>}
              {status && (
                <p className="intro" style={{ color: "#e0a0a0" }}>
                  {status}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="composer-zone">
          <div className="tool-strip">
            {tools.map((tool) => (
              <button key={tool} className={activeTool === tool ? "chosen" : ""} onClick={() => setActiveTool(tool)}>
                {tool}
              </button>
            ))}
          </div>
          <div className="composer">
            {attach && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#b9d0ff", marginBottom: 8 }}>
                <Icon name="paperclip" size={12} /> {attach.name}
                <button onClick={() => setAttach(null)} style={{ background: "none", border: 0, color: "#888", display: "flex" }} aria-label="Remove attachment">
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe what you want to build…"
              aria-label="Describe what you want to build"
            />
            <div className="composer-footer">
              <div className="composer-tools">
                <button onClick={() => fileRef.current?.click()}>
                  <Icon name="paperclip" size={13} /> Attach
                </button>
                <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => onAttach(e.target.files?.[0])} />
                <button onClick={() => setPrompt((p) => p + " @")}>@ Mention</button>
                <button onClick={() => setActiveTool("Research")}>Tools</button>
                <button>Web</button>
                <button onClick={() => setActiveTool("Code")}>Code</button>
                <button>Image</button>
                <button onClick={() => setActiveTool("Deploy")}>Agent</button>
              </div>
              <button className="send" onClick={() => send()} aria-label="Send prompt">
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
          <p className="footnote">MAXXEN can make mistakes. Check important information.</p>
        </div>
      </section>

      {contextOpen && (
        <aside className="context-panel">
          <header>
            <span>CONTEXT</span>
            <button onClick={() => setContextOpen(false)}>
              <Icon name="close" size={15} />
            </button>
          </header>
          <section>
            <p>PROJECT</p>
            <strong>Maxxen Website</strong>
            <span className="branch">
              main <i />
            </span>
          </section>
          <section>
            <p>FILES</p>
            {["app/", "components/", "public/", "package.json"].map((file, i) => (
              <button className="file" key={file}>
                <span className={i === 3 ? "file-dot file-json" : "file-dot"} />
                {file}
              </button>
            ))}
          </section>
          <section>
            <p>PREVIEW</p>
            <div className="preview">
              <div className="preview-nav" />
              {latestHtml ? (
                <iframe title="mini-preview" srcDoc={latestHtml} style={{ width: "100%", height: 60, border: 0, background: "#fff", borderRadius: 4, marginTop: 8 }} />
              ) : (
                <div className="preview-title">
                  MAXXEN
                  <br />
                  <i>FOR THE DIFFERENT</i>
                </div>
              )}
              <span>Live preview</span>
            </div>
            <button className="open-preview" onClick={() => latestHtml && setExpanded(messages.findIndex((m) => m.html))}>
              <Icon name="eye" size={13} /> Open preview
            </button>
          </section>
          <section className="deploy">
            <p>DEPLOYMENT</p>
            <div>
              <span className="vercel">▲</span>
              <b>Vercel</b>
              <small>
                <i /> Ready
              </small>
            </div>
          </section>
        </aside>
      )}
      {!contextOpen && (
        <button className="context-reveal" onClick={() => setContextOpen(true)}>
          Context
        </button>
      )}
    </main>
  );
}
