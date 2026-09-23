"use client";
import { useEffect, useRef, useState } from "react";
import { pushVault } from "@/lib/sync";
import "./chat-a.css";
import "./chat-b.css";
import "./chat-c.css";

import { HtmlFrame, Icon, Marble, Mark, menuField, NAV_HREF, navIcons, PROVIDERS, ls, tools, suggestions } from "./chrome";
import type { Msg, SavedChat } from "./chrome";

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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [attach, setAttach] = useState<{ name: string; text: string } | null>(null);
  const [recent, setRecent] = useState<SavedChat[]>([]);
  const [chatId, setChatId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState("");
  const [prov, setProv] = useState("custom");
  const [fBase, setFBase] = useState("");
  const [fKey, setFKey] = useState("");
  const [fModel, setFModel] = useState("");
  const modelWrapRef = useRef<HTMLDivElement>(null);

  const cleanChats = (v: unknown): SavedChat[] => {
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (c): c is SavedChat =>
          !!c &&
          typeof c === "object" &&
          typeof (c as SavedChat).id === "string" &&
          typeof (c as SavedChat).title === "string" &&
          Array.isArray((c as SavedChat).messages) &&
          (c as SavedChat).messages.every((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      )
      .slice(0, 8);
  };

  useEffect(() => {
    if (!chatId) setChatId(String(Date.now()));
    const onDown = (e: MouseEvent) => {
      if (modelWrapRef.current && !modelWrapRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModelOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [chatId]);

  useEffect(() => {
    const el = stageRef.current;
    if (el && messages.length) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, sending]);

  const onParallax = (e: React.MouseEvent<HTMLElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.querySelectorAll(".marble").forEach((m, i) => {
      const el = m as HTMLElement;
      const depth = [14, 22, 30][i % 3];
      el.style.translate = `${(-x * depth).toFixed(1)}px ${(-y * depth).toFixed(1)}px`;
    });
  };

  useEffect(() => {
    (async () => {
      const s = ls("maxxen_session");
      if (!s) { setReady(true); return; }
      try {
        const r = await fetch("/api/auth/me", { method: "POST", body: JSON.stringify({ session: s }) });
        if (!r.ok) { ls("maxxen_session", "__DEL__"); window.location.href = "/login"; return; }
        setSession(s);
      } catch {
        setSession(s);
      }
    })();
    setEmail(ls("maxxen_otp_email"));
    const savedModel = ls("maxxen_model");
    setModel(savedModel);
    setProv(ls("maxxen_provider") || "custom");
    setFBase(ls("maxxen_baseurl"));
    setFKey(ls("maxxen_apikey"));
    setFModel(savedModel);
    try {
      const all = cleanChats(JSON.parse(ls("maxxen_chats") || "[]"));
      setRecent(all);
      const openId = ls("maxxen_open_chat");
      if (openId) {
        ls("maxxen_open_chat", "__DEL__");
        const found = all.find((c) => c.id === openId);
        if (found) {
          setMessages(found.messages);
          setChatId(found.id);
        }
      }
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

  const pickProvider = (id: string) => {
    const p = PROVIDERS.find((x) => x.id === id);
    if (!p) return;
    setProv(id);
    setFBase(p.baseURL);
    setFModel(p.model);
    ls("maxxen_provider", id);
    ls("maxxen_baseurl", p.baseURL);
    ls("maxxen_model", p.model);
  };

  const applyEndpoint = () => {
    if (!fKey.trim()) {
      setStatus("Paste your API key first.");
      return;
    }
    if (!fModel.trim()) {
      setStatus("Enter the Model ID your provider gave you.");
      return;
    }
    ls("maxxen_baseurl", fBase.trim());
    ls("maxxen_apikey", fKey.trim());
    ls("maxxen_model", fModel.trim());
    ls("maxxen_provider", prov === "custom" ? "custom" : prov);
    setModel(fModel.trim());
    setModelOpen(false);
    setStatus("Saved locally — syncing to YOUR repo…");
    void pushVault(ls("maxxen_session")).then((v) => setStatus(v.message));
  };

  const send = async (text?: string) => {
    const raw = (text ?? prompt).trim();
    if (!raw || sending) return;
    const key = ls("maxxen_apikey");
    const base = ls("maxxen_baseurl");
    const mid = ls("maxxen_model");
    if (!key || !mid) {
      setStatus("Set your Base URL + API key + Model ID in the model menu (top bar) or /settings first.");
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
          apiKey: key,
          baseURL: base,
          model: mid,
          provider: ls("maxxen_provider") || "custom",
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
    const isBinary = text.indexOf(String.fromCharCode(0)) !== -1;
    if (!text.trim() || isBinary) {
      setStatus(isBinary ? "That looks like a binary file — attach a text file instead." : "Couldn't read that file as text.");
      return;
    }
    setAttach({ name: f.name, text });
  };

  const saveToGithub = async (html: string) => {
    const token = ls("maxxen_github_token");
    if (!token) {
      setStatus("Paste YOUR GitHub token on the Settings page first — then Apply saves there.");
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
  const activeModelLabel = model || "Set model";
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
          <a href="/login" className="quiet-button" style={{ textDecoration: "none", display: "inline-block", lineHeight: "30px" }}>
            Go to login
          </a>
        </div>
      </main>
    );

  return (
    <main className="app-shell" onMouseMove={onParallax}>
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
          {["Home", "Chats", "Projects", "Artifacts", "Agents", "Plugins"].map((item, i) => (
            <a key={item} href={NAV_HREF[item]} className={`nav-item ${item === "Chats" ? "active" : ""}`} style={{ textDecoration: "none" }}>
              <Icon name={navIcons[i]} />
              {item}
            </a>
          ))}
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
          <a href="/settings" aria-label="Settings" style={{ marginLeft: "auto", color: "#6f6f75", padding: 4 }}>
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
            <div className="model-wrap" ref={modelWrapRef}>
              <button className="model" onClick={() => setModelOpen(!modelOpen)} aria-haspopup="menu" aria-expanded={modelOpen}>
                <span className="model-glyph">✦</span> {activeModelLabel} <Icon name="chevron" size={14} />
              </button>
              {modelOpen && (
                <div className="model-menu" role="menu" style={{ width: 252 }}>
                  <small>PICK YOUR AI (BYOK)</small>
                  <div style={{ display: "flex", gap: 6, padding: "2px 7px 9px" }}>
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => pickProvider(p.id)}
                        style={{ flex: 1, borderColor: prov === p.id ? "rgba(205,220,255,.35)" : undefined, background: prov === p.id ? "rgba(203,220,255,.08)" : undefined }}
                      >
                        {p.glyph} {p.label}
                      </button>
                    ))}
                  </div>
                  <small>YOUR ENDPOINT</small>
                  <div style={{ display: "grid", gap: 6, padding: "2px 7px 9px" }}>
                    <input value={fBase} onChange={(e) => { setFBase(e.target.value); setProv("custom"); }} placeholder="Base URL — https://api.openai.com/v1" aria-label="Base URL" style={menuField} />
                    <input value={fKey} onChange={(e) => setFKey(e.target.value)} placeholder="API key — paste once, synced per account" aria-label="API key" type="password" autoComplete="off" style={menuField} />
                    <input
                      value={fModel}
                      onChange={(e) => { setFModel(e.target.value); setProv("custom"); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyEndpoint();
                        }
                      }}
                      placeholder="Model ID — e.g. gpt-4o-mini"
                      aria-label="Model ID"
                      style={menuField}
                    />
                    <button onClick={applyEndpoint} style={{ flex: "0 0 auto" }}>
                      Use endpoint <b>→</b>
                    </button>
                    <span style={{ fontSize: 8, color: "#6e6e75", padding: "0 2px", lineHeight: 1.5 }}>
                      OpenAI · Gemini (OpenAI-compatible URL) · OpenRouter · Groq · DeepSeek · Ollama — any base URL + key + model ID.
                    </span>
                  </div>
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

        <div ref={stageRef} className={`stage ${hasMessages ? "has-message" : ""}`}>
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
                <p className="intro" role="status" style={{ color: "#e0a0a0" }}>
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
                          <span className="mx-dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
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
                              <button onClick={() => m.html && setExpanded(expanded === m.html ? null : m.html)}>
                                Open preview <Icon name="eye" size={14} />
                              </button>
                              <button className="apply" onClick={() => m.html && saveToGithub(m.html)}>
                                Apply changes
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {m.html && expanded === m.html && <HtmlFrame html={m.html} height={420} title={`preview-${i}`} framed />}
                      <small>{m.at}</small>
                    </div>
                  </div>
                )
              )}
              {sending && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                <div className="message assistant-message" aria-hidden="true">
                  <div className="assistant-mark">
                    <Mark />
                  </div>
                  <div className="assistant-copy">
                    <div className="mx-skel">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
              )}
              {sending && <p className="thinking" style={{ marginTop: 24 }}>…</p>}
              {status && (
                <p className="intro" role="status" style={{ color: "#e0a0a0" }}>
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
              <button className="send" onClick={() => send()} aria-label="Send prompt" disabled={sending}>
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
                <HtmlFrame html={latestHtml} height={60} title="mini-preview" />
              ) : (
                <div className="preview-title">
                  MAXXEN
                  <br />
                  <i>FOR THE DIFFERENT</i>
                </div>
              )}
              <span>Live preview</span>
            </div>
            <button className="open-preview" onClick={() => latestHtml && setExpanded(latestHtml === expanded ? null : latestHtml)}>
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
