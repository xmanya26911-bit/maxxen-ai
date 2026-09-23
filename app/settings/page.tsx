"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };
type Tab = "chat" | "builder" | "plugins" | "storage" | "hosting" | "settings";

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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [buildHtml, setBuildHtml] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!ls("maxxen_session")) { router.replace("/login"); return; }
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

  const activeKey = provider === "gemini" ? geminiKey : openaiKey;

  async function testComposio() {
    setStatus("Checking YOUR Composio…");
    const r = await fetch("/api/composio/connect", { method: "POST", body: JSON.stringify({ composioKey, toolkit }) });
    const j = await r.json();
    setStatus(j.ok ? `${j.hint} Connect plugins at app.composio.dev with YOUR key.` : j.error);
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
      <nav className="flex gap-2 px-6 py-3 border-b border-white/10 overflow-x-auto">
        {(["chat", "builder", "plugins", "storage", "hosting", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg capitalize text-sm ${tab === t ? "bg-violet-600" : "bg-white/5"}`}>{t}</button>
        ))}
      </nav>
      <div className="max-w-5xl mx-auto p-6">
        {status && <div className="glass p-3 rounded-xl mb-4 text-sm">{status}</div>}
        {tab === "plugins" && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-xl font-bold">Your Composio — Your Plugins</h2>
            <p className="text-white/60 text-sm mt-1">Paste YOUR Composio API key, then connect Gmail, GitHub, Notion, Slack, Vercel from YOUR dashboard.</p>
            <input className="input mt-4" placeholder="YOUR Composio API key" value={composioKey} onChange={(e) => setComposioKey(e.target.value)} />
            <div className="flex gap-2 mt-3">
              <input className="input" placeholder="toolkit: gmail, github, notion..." value={toolkit} onChange={(e) => setToolkit(e.target.value)} />
              <button onClick={testComposio} className="btn-primary px-5">Check</button>
            </div>
            <a href="https://app.composio.dev" target="_blank" className="text-fuchsia-300 text-sm underline mt-3 inline-block">Open YOUR Composio dashboard</a>
            <button onClick={saveSettings} className="btn-primary px-5 py-2 mt-4 block">Save</button>
          </div>
        )}
        {tab === "storage" && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-xl font-bold">Your GitHub Storage (not mine)</h2>
            <p className="text-white/60 text-sm">Paste YOUR GitHub token (repo scope). Maxxen uses maxxen-data in YOUR account.</p>
            <input className="input mt-4" placeholder="ghp_... YOUR token" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} />
            <button onClick={saveSettings} className="bg-white/10 px-5 py-2 rounded-xl mt-3">Save</button>
          </div>
        )}
        {tab === "hosting" && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-xl font-bold">Your Vercel Hosting</h2>
            <p className="text-white/60 text-sm">Host from YOUR Vercel account. Create project maxxen, paste YOUR token.</p>
            <input className="input mt-4" placeholder="YOUR Vercel token" value={vercelToken} onChange={(e) => setVercelToken(e.target.value)} />
            <input className="input mt-2" placeholder="Project name (maxxen)" value={vercelProject} onChange={(e) => setVercelProject(e.target.value)} />
            <button onClick={saveSettings} className="btn-primary px-5 py-2 mt-3">Save</button>
          </div>
        )}
        {(tab === "settings" || tab === "chat" || tab === "builder") && (
          <div className="glass rounded-2xl p-6 space-y-3">
            <h2 className="text-xl font-bold">BYOK Settings — zero cost for owner</h2>
            <p className="text-white/60 text-sm">Keys live only in YOUR browser. Chat in <a href="/chat" className="underline text-fuchsia-300">/chat</a>.</p>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input"><option value="openai">ChatGPT / OpenAI</option><option value="gemini">Gemini</option></select>
            <input className="input" placeholder="OpenAI key sk-... (YOUR browser only)" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} />
            <input className="input" placeholder="Gemini key AIza... (YOUR browser only)" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
            <input className="input" placeholder="Custom Base URL (optional)" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
            <input className="input" placeholder="Model (gpt-4o-mini, gemini-1.5-flash)" value={model} onChange={(e) => setModel(e.target.value)} />
            <button onClick={saveSettings} className="btn-primary px-6 py-3">Save all</button>
          </div>
        )}
      </div>
    </main>
  );
}
