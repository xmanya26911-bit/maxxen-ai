"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CButton, CField, CPanel, CSelect, CStatus } from "@/components/ui";

type Tab = "plugins" | "storage" | "hosting" | "settings";

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
  const [tab, setTab] = useState<Tab>("settings");
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
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);

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
      setProvider(ls("maxxen_provider") || "openai");
      setOpenaiKey(ls("maxxen_openai_key"));
      setGeminiKey(ls("maxxen_gemini_key"));
      setBaseURL(ls("maxxen_baseurl"));
      setModel(ls("maxxen_model"));
      setGithubToken(ls("maxxen_github_token"));
      setVercelToken(ls("maxxen_vercel_token"));
      setVercelProject(ls("maxxen_vercel_project") || "maxxen");
      setComposioKey(ls("maxxen_composio_key"));
      setReady(true);
    })();
  }, [router]);

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

  async function testComposio() {
    if (checking) return;
    setChecking(true);
    setStatus("Checking YOUR Composio…");
    try {
      const r = await fetch("/api/composio/connect", { method: "POST", body: JSON.stringify({ composioKey, toolkit }) });
      const j = await r.json();
      setStatus(j.ok ? `${j.hint} Connect plugins at app.composio.dev with YOUR key.` : j.error || "Check failed");
    } catch (e: any) {
      setStatus(e.message || "Check failed");
    }
    setChecking(false);
  }

  if (!ready) return <main className="min-h-screen bg-[#07070f]" />;

  return (
    <main className="min-h-screen bg-[#07070f] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="font-black text-xl" style={{ textDecoration: "none", color: "inherit" }}>MAXXEN <span className="text-fuchsia-400">AI</span></a>
          <a href="/chat" className="btn-primary px-4 py-1.5 text-sm" style={{ textDecoration: "none" }}>Open Chat →</a>
        </div>
        <button onClick={() => { ls("maxxen_session", "__DEL__"); router.push("/login"); }} className="text-sm text-white/60 hover:text-white">Logout</button>
      </header>
      <nav className="flex gap-2 px-6 py-3 border-b border-white/10 overflow-x-auto" aria-label="Settings sections">
        {(["plugins", "storage", "hosting", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`px-4 py-2 rounded-lg capitalize text-sm ${tab === t ? "bg-violet-600" : "bg-white/5"}`}>{t}</button>
        ))}
      </nav>
      <div className="max-w-5xl mx-auto p-6">
        <CStatus text={status} />
        {tab === "plugins" && (
          <CPanel title="Your Composio — Your Plugins" sub="Paste YOUR Composio API key, then connect Gmail, GitHub, Notion, Slack, Vercel from YOUR dashboard.">
            <CField placeholder="YOUR Composio API key" value={composioKey} onChange={(e) => setComposioKey(e.target.value)} aria-label="Composio API key" />
            <div className="flex gap-2">
              <CField placeholder="toolkit: gmail, github, notion..." value={toolkit} onChange={(e) => setToolkit(e.target.value)} aria-label="Toolkit name" />
              <CButton onClick={testComposio}>{checking ? "Checking…" : "Check"}</CButton>
            </div>
            <a href="https://app.composio.dev" target="_blank" rel="noreferrer" className="text-fuchsia-300 text-sm underline inline-block">Open YOUR Composio dashboard</a>
            <div><CButton onClick={saveSettings}>Save</CButton></div>
          </CPanel>
        )}
        {tab === "storage" && (
          <CPanel title="Your GitHub Storage (not mine)" sub="Paste YOUR GitHub token (repo scope). Maxxen uses maxxen-data in YOUR account.">
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
        {tab === "settings" && (
          <CPanel title="BYOK Settings — zero cost for owner" sub="Keys live only in YOUR browser. Chat in /chat.">
            <CSelect value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="AI provider">
              <option value="openai">ChatGPT / OpenAI</option>
              <option value="gemini">Gemini</option>
            </CSelect>
            <CField placeholder="OpenAI key sk-... (YOUR browser only)" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} aria-label="OpenAI API key" />
            <CField placeholder="Gemini key AIza... (YOUR browser only)" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} aria-label="Gemini API key" />
            <CField placeholder="Custom Base URL (optional)" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} aria-label="Custom base URL" />
            <CField placeholder="Model (gpt-4o-mini, gemini-1.5-flash)" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model name" />
            <div><CButton onClick={saveSettings}>Save all</CButton></div>
          </CPanel>
        )}
      </div>
    </main>
  );
}
