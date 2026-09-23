"use client";
import { useEffect, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type Tab = "chat" | "builder" | "plugins" | "storage" | "hosting" | "settings";

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

export default function Home() {
  const [session, setSession] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [ticket, setTicket] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const [provider, setProvider] = useState("openai");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [vercelProject, setVercelProject] = useState("maxxen");
  const [composioKey, setComposioKey] = useState("");
  const [toolkit, setToolkit] = useState("gmail");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [buildHtml, setBuildHtml] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setSession(ls("maxxen_session"));
    const savedEmail = ls("maxxen_otp_email");
    if (savedEmail) { setEmail(savedEmail); setTicket(ls("maxxen_otp_ticket")); setOtpSent(true); }
    setProvider(ls("maxxen_provider") || "openai");
    setOpenaiKey(ls("maxxen_openai_key"));
    setGeminiKey(ls("maxxen_gemini_key"));
    setBaseURL(ls("maxxen_baseurl"));
    setModel(ls("maxxen_model"));
    setGithubToken(ls("maxxen_github_token"));
    setVercelToken(ls("maxxen_vercel_token"));
    setVercelProject(ls("maxxen_vercel_project") || "maxxen");
    setComposioKey(ls("maxxen_composio_key"));
  }, []);

  const saveSettings = () => {
    ls("maxxen_provider", provider);
    ls("maxxen_openai_key", openaiKey);
    ls("maxxen_gemini_key", geminiKey);
    ls("maxxen_baseurl", baseURL);
    ls("maxxen_model", model);
    ls("maxxen_github_token", githubToken);
    ls("maxxen_vercel_token", vercelToken);
    ls("maxxen_vercel_project", vercelProject);
    ls("maxxen_composio_key", composioKey);
    setStatus("Saved locally in your browser + ready to sync to YOUR GitHub.");
  };

  const activeKey = provider === "gemini" ? geminiKey : openaiKey;

  async function sendOtp() {
    setAuthMsg("Sending...");
    const r = await fetch("/api/auth/send-otp", { method: "POST", body: JSON.stringify({ email }) });
    const j = await r.json();
    if (j.ok) { setOtpSent(true); setTicket(j.ticket || ""); ls("maxxen_otp_ticket", j.ticket || ""); ls("maxxen_otp_email", email); setAuthMsg("6-digit code sent from xmanya26911@gmail.com"); }
    else setAuthMsg(j.error || "Failed");
  }
  async function verifyOtp() {
    setAuthMsg("Verifying...");
    const r = await fetch("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, code: otp, ticket }) });
    const j = await r.json();
    if (j.ok) { ls("maxxen_otp_ticket", "__DEL__"); ls("maxxen_otp_email", "__DEL__"); ls("maxxen_session", j.session); setSession(j.session); setAuthMsg(""); }
    else setAuthMsg(j.error || "Incorrect code");
  }
  async function chat(sendText?: string) {
    const text = sendText ?? input;
    if (!text.trim() || loading) return;
    if (!activeKey) { setStatus("Paste your Gemini or OpenAI key in Settings first (BYOK)."); setTab("settings"); return; }
    const next = [...messages, { role: "user", content: text } as Msg];
    setMessages(next); setInput(""); setLoading(true); setStatus("");
    try {
      const r = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: next, provider, apiKey: activeKey, baseURL, model }) });
      const j = await r.json();
      if (j.error) setStatus(j.error);
      else {
        const reply = j.reply as string;
        setMessages([...next, { role: "assistant", content: reply }]);
        const m = reply.match(/```html([\s\S]*?)```/i);
        if (m) setBuildHtml(m[1].trim());
      }
    } catch (e: any) { setStatus(e.message); }
    setLoading(false);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-violet-950 via-black to-fuchsia-950 flex items-center justify-center p-6">
        <div className="glass max-w-md w-full p-8 rounded-3xl">
          <h1 className="text-4xl font-black">MAXXEN <span className="text-fuchsia-400">AI</span></h1>
          <p className="text-white/60 mt-2">Build anything. Your keys. Your GitHub. Your Vercel. Your plugins.</p>
          <input className="input mt-6" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} />
          {!otpSent ? (
            <button onClick={sendOtp} className="btn-primary w-full mt-3 py-3">Send 6-digit code</button>
          ) : (
            <>
              <input className="input mt-3 text-center text-2xl tracking-[0.5em]" placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6} />
              <button onClick={verifyOtp} className="btn-primary w-full mt-3 py-3">Verify and Login</button>
              <button onClick={sendOtp} className="w-full mt-2 py-2 text-sm text-white/60 hover:text-white">Resend code (older codes stop working)</button>
            </>
          )}
          {authMsg && <p className="text-sm text-white/70 mt-3">{authMsg}</p>}
          <p className="text-xs text-white/40 mt-4">Code from xmanya26911@gmail.com, expires in 10 min. Everything is BYOK + your GitHub.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-[#07070f]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="font-black text-xl">MAXXEN <span className="text-fuchsia-400">AI</span></div>
        <div className="flex items-center gap-3">
          <a href="/chat" className="btn-primary px-4 py-1.5 text-sm" style={{ textDecoration: "none" }}>Open Chat →</a>
          <button onClick={()=>{ls("maxxen_session","__DEL__"); setSession("");}} className="text-sm text-white/60 hover:text-white">Logout</button>
        </div>
      </header>
