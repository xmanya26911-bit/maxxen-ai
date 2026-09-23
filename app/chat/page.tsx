"use client";
import { memo, useEffect, useRef, useState } from "react";
import { pushVault } from "@/lib/sync";
import "./chat-a.css";
import "./chat-b.css";
import "./chat-c.css";

type Msg = { role: "user" | "assistant"; content: string; html?: string; at: string };
type SavedChat = { id: string; title: string; messages: Msg[]; at: string };

const nav = ["Home", "Chats", "Projects", "Artifacts", "Agents", "Plugins"];
const navIcons = ["home", "chat", "grid", "box", "bolt", "grid"];
const tools = ["Chat", "Build", "Code", "Design", "Research", "Deploy"];
const suggestions = ["Build a landing page", "Create a dashboard", "Design an app", "Connect an API"];
const NAV_HREF: Record<string, string> = { Home: "/", Chats: "/chat", Projects: "/projects", Artifacts: "/artifacts", Agents: "/agents", Plugins: "/plugins" };

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

const HtmlFrame = memo(function HtmlFrame({ html, height, title, framed }: { html: string; height: number; title: string; framed?: boolean }) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox="allow-scripts"
      style={
        framed
          ? { width: "100%", height, border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, marginTop: 12, background: "#fff" }
          : { width: "100%", height, border: 0, background: "#fff", borderRadius: 4, marginTop: 8 }
      }
    />
  );
});

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

const menuField = {
  width: "100%",
  background: "rgba(0,0,0,.4)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 6,
  padding: "8px",
  color: "#eee",
  fontSize: 11,
  outline: "none",
} as const;

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
