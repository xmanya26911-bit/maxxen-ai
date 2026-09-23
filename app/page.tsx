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
    if (j.ok) { setOtpSent(true); setTicket(j.ticket || ""); setAuthMsg("6-digit code sent from xmanya26911@gmail.com"); }
    else setAuthMsg(j.error || "Failed");
  }
  async function verifyOtp() {
    setAuthMsg("Verifying...");
    const r = await fetch("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, code: otp, ticket }) });
    const j = await r.json();
    if (j.ok) { ls("maxxen_session", j.session); setSession(j.session); setAuthMsg(""); }
    else setAuthMsg(j.error || "Incorrect code");
  }
