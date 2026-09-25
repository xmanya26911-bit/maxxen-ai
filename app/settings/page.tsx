"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CButton, CField, CPanel, CStatus } from "@/components/ui";
import { pushVault, pullVault, forgetVault } from "@/lib/sync";
type Tab = "endpoint" | "plugins" | "storage" | "hosting";
const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};
export default function Settings() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("endpoint");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("custom");
  const [githubToken, setGithubToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [vercelProject, setVercelProject] = useState("maxxen");
  const [composioKey, setComposioKey] = useState("");
  const [toolkit, setToolkit] = useState("gmail");
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const lastPull = useRef(0);
  const PRESETS: Record<string, { baseURL: string; model: string; keyHint: string }> = {
    openai: { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini", keyHint: "sk-… from platform.openai.com/api-keys" },
    anthropic: { baseURL: "https://api.anthropic.com", model: "claude-3-5-haiku-latest", keyHint: "sk-ant-… from console.anthropic.com" },
    gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-1.5-flash", keyHint: "AIza… from aistudio.google.com" },
    openrouter: { baseURL: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", keyHint: "sk-or-… from openrouter.ai" },
  };
  const pickPreset = (id: string) => {
    const p = PRESETS[id];
    if (!p) return;
    setProvider(id);
    setBaseURL(p.baseURL);
    setModel(p.model);
  };
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
      setBaseURL(ls("maxxen_baseurl"));
      setApiKey(ls("maxxen_apikey"));
      setModel(ls("maxxen_model"));
      setProvider(ls("maxxen_provider") || "custom");
      setGithubToken(ls("maxxen_github_token"));
      setVercelToken(ls("maxxen_vercel_token"));
      setVercelProject(ls("maxxen_vercel_project") || "maxxen");
      setComposioKey(ls("maxxen_composio_key"));
      setReady(true);
    })();
  }, [router]);
  const saveSettings = () => {
    ls("maxxen_baseurl", baseURL.trim());
    ls("maxxen_apikey", apiKey.trim());
    ls("maxxen_model", model.trim());
    ls("maxxen_provider", provider);
    ls("maxxen_github_token", githubToken);
    ls("maxxen_vercel_token", vercelToken);
    ls("maxxen_vercel_project", vercelProject.trim() || "maxxen");
    ls("maxxen_composio_key", composioKey.trim());
    setStatus("Saved locally — syncing to YOUR repo…");
    void pushVault(ls("maxxen_session")).then((v) => setStatus(v.message));
  };
  const forgetAll = async () => {
    setStatus("Wiping vault…");
    const v = await forgetVault(ls("maxxen_session"));
    setApiKey("");
    setGithubToken("");
    setVercelToken("");
    setComposioKey("");
    setStatus(v.message);
  };
  async function testComposio() {
    if (checking) return;
    setChecking(true);
    setStatus("Checking YOUR Composio…");
    try {
      const r = await fetch("/api/composio/connect", { method: "POST", body: JSON.stringify({ composioKey, toolkit }) });
      const j = await r.json();
      setStatus(j.ok ? (j.hint + " Connect plugins at app.composio.dev with YOUR key.") : j.error || "Check failed");
    } catch (e: any) {
      setStatus(e.message || "Check failed");
    }
    setChecking(false);
  }
  useEffect(() => {
    if (!ready) return;
    const onFocus = async () => {
      if (Date.now() - lastPull.current < 60000) return;
      lastPull.current = Date.now();
      const v = await pullVault(ls("maxxen_session"));
      if (v.ok && v.applied > 0) {
        setBaseURL(ls("maxxen_baseurl"));
        setApiKey(ls("maxxen_apikey"));
        setModel(ls("maxxen_model"));
        setProvider(ls("maxxen_provider") || "custom");
        setGithubToken(ls("maxxen_github_token"));
        setVercelToken(ls("maxxen_vercel_token"));
        setVercelProject(ls("maxxen_vercel_project") || "maxxen");
        setComposioKey(ls("maxxen_composio_key"));
        setStatus("Synced from YOUR repo — " + v.message);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ready]);
  if (!ready) return <main className="min-h-screen" style={{ background: "var(--mx-bg)" }} />;
  return (
    <main className="min-h-screen text-white" style={{ background: "var(--mx-bg)" }}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="font-black text-xl" style={{ textDecoration: "none", color: "inherit" }}>MAXXEN <span style={{ color: "var(--mx-link)" }}>AI</span></a>
          <a href="/chat" className="mx-btn" style={{ textDecoration: "none", fontSize: 13, padding: "9px 16px" }}>Open Chat</a>
        </div>
        <button onClick={() => { ls("maxxen_session", "__DEL__"); router.push("/login"); }} className="text-sm text-white/60 hover:text-white">Logout</button>
      </header>
      <nav className="flex gap-2 px-6 py-3 border-b border-white/10 overflow-x-auto" aria-label="Settings sections">
        {(["endpoint", "plugins", "storage", "hosting"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className="mx-tab" style={{ textTransform: "capitalize" }}>{t}</button>
        ))}
      </nav>
      <div className="max-w-5xl mx-auto p-6">
        <CStatus text={status} />
        {tab === "endpoint" && (
          <CPanel title="Your AI — ChatGPT, Claude, Gemini, or one key for all" sub="Tap a provider, paste the one key, done.">
            <div style={{ display: "flex", gap: 8 }}>
              {["openai", "anthropic", "gemini", "openrouter"].map((id) => (
                <CButton key={id} variant={provider === id ? "primary" : "ghost"} onClick={() => pickPreset(id)}>{id}</CButton>
              ))}
            </div>
            <CField placeholder="Base URL — e.g. https://api.openai.com/v1" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} aria-label="Base URL" inputMode="url" />
            <CField placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} aria-label="API key" type="password" autoComplete="off" />
            <p style={{ fontSize: 11, color: "var(--mx-meta)" }}>Key format: {PRESETS[provider]?.keyHint || "as issued by your provider"}</p>
            <CField placeholder="Model ID — e.g. gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model ID" />
            <div><CButton onClick={saveSettings}>Save endpoint</CButton></div>
            <div><CButton variant="danger" onClick={() => void forgetAll()}>Forget my vault</CButton></div>
            <p style={{ fontSize: 11, color: "var(--mx-meta)", lineHeight: 1.6 }}>Preferences sync as plain text, keys as AES-256-GCM ciphertext — both in YOUR private maxxen-data repo.</p>
          </CPanel>
        )}
        {tab === "plugins" && (
          <CPanel title="Your Composio — Your Plugins" sub="Paste YOUR Composio API key, then connect toolkits from YOUR dashboard. Manage them on /plugins.">
            <CField placeholder="YOUR Composio API key" value={composioKey} onChange={(e) => setComposioKey(e.target.value)} aria-label="Composio API key" />
            <div className="flex gap-2">
              <CField placeholder="toolkit: gmail, github, notion..." value={toolkit} onChange={(e) => setToolkit(e.target.value)} aria-label="Toolkit name" />
              <CButton onClick={testComposio}>{checking ? "Checking…" : "Check"}</CButton>
            </div>
            <a href="/plugins" style={{ color: "var(--mx-link)", fontSize: 13 }}>Open the plugin hub</a>
            <div><CButton onClick={saveSettings}>Save</CButton></div>
          </CPanel>
        )}
        {tab === "storage" && (
          <CPanel title="Your GitHub Storage (not mine)" sub="Paste YOUR GitHub token (repo scope). Maxxen uses maxxen-data in YOUR account. Browse it on /projects.">
            <CField placeholder="ghp_... YOUR token" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} aria-label="GitHub personal access token" />
            <div><CButton variant="ghost" onClick={saveSettings}>Save</CButton></div>
          </CPanel>
        )}
        {tab === "hosting" && (
          <CPanel title="Your Vercel Hosting" sub="Host from YOUR Vercel account. Create project maxxen, paste YOUR token.">
            <CField placeholder="YOUR Vercel token" value={vercelToken} onChange={(e) => setVercelToken(e.target.value)} aria-label="Vercel token" />
            <CField placeholder="Project name (maxxen)" value={vercelProject} onChange={(e) => setVercelProject(e.target.value)} aria-label="Vercel project name" />
            <div><CButton onClick={saveSettings}>Save</CButton></div>
          </CPanel>
        )}
      </div>
    </main>
  );
}