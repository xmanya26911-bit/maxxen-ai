"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, LogOut, TriangleAlert } from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { validateSession } from "@/lib/auth-api";
import { forgetVault, pullVault, pushVault } from "@/lib/sync";

const PRESETS: Record<string, { baseURL: string; model: string; label: string }> = {
  openai: { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini", label: "◈ ChatGPT" },
  anthropic: { baseURL: "https://api.anthropic.com", model: "claude-3-5-haiku-latest", label: "✶ Claude" },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-1.5-flash",
    label: "⬢ Gemini",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    label: "⬣ All-in-one",
  },
};

function ls(key: string, value?: string): string {
  if (typeof window === "undefined") return "";
  if (value === undefined) return window.localStorage.getItem(key) ?? "";
  window.localStorage.setItem(key, value);
  return value;
}

const FIELD =
  "mx-focus w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30";
const LABEL =
  "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/40";
const BTN_PRIMARY =
  "mx-focus mx-press inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-black transition-all hover:bg-white/90 disabled:opacity-40";
const BTN_GHOST =
  "mx-focus mx-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40";
const BTN_DANGER =
  "mx-focus mx-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-400/[0.06] px-4 text-sm font-medium text-red-200 transition-colors hover:bg-red-400/[0.12] disabled:opacity-40";

export function SettingsForm() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState("custom");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [vercelProject, setVercelProject] = useState("maxxen");
  const [composioKey, setComposioKey] = useState("");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"ok" | "err" | "info">("info");
  const [saving, setSaving] = useState(false);
  const [wiping, setWiping] = useState(false);

  const flash = (message: string, kind: "ok" | "err" | "info" = "info") => {
    setStatus(message);
    setStatusKind(kind);
  };

  // Auth gate + hydrate from localStorage (then best-effort vault pull).
  useEffect(() => {
    (async () => {
      const s = useAuthStore.getState().session;
      if (!s) {
        router.replace("/login");
        return;
      }
      if (s.token) {
        const email = await validateSession(s.token);
        if (!email) {
          useAuthStore.getState().signOut();
          router.replace("/login");
          return;
        }
      }
      setProvider(ls("maxxen_provider") || "custom");
      setBaseURL(ls("maxxen_baseurl"));
      setApiKey(ls("maxxen_apikey"));
      setModel(ls("maxxen_model"));
      setGithubToken(ls("maxxen_github_token"));
      setVercelToken(ls("maxxen_vercel_token"));
      setVercelProject(ls("maxxen_vercel_project") || "maxxen");
      setComposioKey(ls("maxxen_composio_key"));
      setReady(true);
      const stored = useAuthStore.getState().session;
      if (stored?.token && ls("maxxen_github_token")) {
        const v = await pullVault(stored.token);
        if (v.ok && v.applied > 0) {
          setBaseURL(ls("maxxen_baseurl"));
          setApiKey(ls("maxxen_apikey"));
          setModel(ls("maxxen_model"));
          setProvider(ls("maxxen_provider") || "custom");
          setGithubToken(ls("maxxen_github_token"));
          setVercelToken(ls("maxxen_vercel_token"));
          setVercelProject(ls("maxxen_vercel_project") || "maxxen");
          setComposioKey(ls("maxxen_composio_key"));
          flash(`Synced from YOUR repo — ${v.message}`, "ok");
        }
      }
    })();
  }, []);

  const pickPreset = (id: string) => {
    const p = PRESETS[id];
    if (!p) return;
    // State only — persisted on Save (abandoning the page changes nothing).
    setProvider(id);
    setBaseURL(p.baseURL);
    setModel(p.model);
  };

  const saveAll = async () => {
    if (saving) return;
    setSaving(true);
    ls("maxxen_provider", provider);
    ls("maxxen_baseurl", baseURL.trim());
    ls("maxxen_apikey", apiKey.trim());
    ls("maxxen_model", model.trim());
    ls("maxxen_github_token", githubToken.trim());
    ls("maxxen_vercel_token", vercelToken.trim());
    ls("maxxen_vercel_project", vercelProject.trim() || "maxxen");
    ls("maxxen_composio_key", composioKey.trim());
    flash("Saved locally — syncing to YOUR repo…", "info");
    const token = useAuthStore.getState().session?.token ?? "";
    const v = await pushVault(token);
    flash(v.message, v.ok ? "ok" : "err");
    setSaving(false);
  };

  const wipeAll = async () => {
    if (wiping) return;
    if (!window.confirm("Wipe synced keys and preferences? Local chats stay.")) return;
    setWiping(true);
    flash("Wiping vault…", "info");
    const token = useAuthStore.getState().session?.token ?? "";
    const v = await forgetVault(token);
    setApiKey("");
    setGithubToken("");
    setVercelToken("");
    setComposioKey("");
    flash(v.message, v.ok ? "ok" : "err");
    setWiping(false);
  };

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" role="status" aria-label="Loading settings">
        <ChromeLogo size={40} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 md:px-6">
        <Link
          href="/chat"
          className="mx-focus inline-flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-white"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Chat
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/30">/ settings</span>
        <span className="ml-auto hidden font-mono text-[11px] text-white/40 sm:block">
          {session?.email ?? ""}
        </span>
        <button
          type="button"
          onClick={() => {
            signOut();
            router.push("/login");
          }}
          className="mx-focus mx-press inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-white"
        >
          <LogOut size={13} aria-hidden="true" />
          Sign out
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Workspace settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your endpoint, your tokens, your vault. Everything syncs encrypted to YOUR GitHub.
        </p>

        {status && (
          <div
            role="status"
            className={cn(
              "mt-5 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px]",
              statusKind === "ok" && "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100/90",
              statusKind === "err" && "border-red-400/25 bg-red-400/[0.06] text-red-100/90",
              statusKind === "info" && "border-white/10 bg-white/[0.03] text-white/70"
            )}
          >
            {statusKind === "err" ? (
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            ) : statusKind === "ok" ? (
              <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            ) : null}
            <span>{status}</span>
          </div>
        )}

        <section aria-labelledby="endpoint-h" className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
          <h2 id="endpoint-h" className="text-[15px] font-semibold">AI endpoint</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Tap a provider, paste the one key, done. Used for every chat generation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Provider presets">
            {Object.entries(PRESETS).map(([id, p]) => (
              <button
                key={id}
                type="button"
                onClick={() => pickPreset(id)}
                aria-pressed={provider === id}
                className={cn(
                  "mx-focus mx-press rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                  provider === id
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <div>
              <label htmlFor="set-base" className={LABEL}>Base URL</label>
              <input id="set-base" className={FIELD} value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" inputMode="url" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="set-key" className={LABEL}>API key</label>
              <input id="set-key" className={FIELD} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" type="password" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="set-model" className={LABEL}>Model ID</label>
              <input id="set-model" className={FIELD} value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" autoComplete="off" />
            </div>
          </div>
        </section>

        <section aria-labelledby="tokens-h" className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
          <h2 id="tokens-h" className="text-[15px] font-semibold">Integrations</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Your tokens — GitHub storage, Vercel deploys, Composio plugins.
          </p>
          <div className="mt-4 grid gap-3">
            <div>
              <label htmlFor="set-gh" className={LABEL}>GitHub token (repo scope)</label>
              <input id="set-gh" className={FIELD} value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="ghp_…" type="password" autoComplete="off" />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <div>
                <label htmlFor="set-vercel" className={LABEL}>Vercel token</label>
                <input id="set-vercel" className={FIELD} value={vercelToken} onChange={(e) => setVercelToken(e.target.value)} placeholder="YOUR token" type="password" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="set-project" className={LABEL}>Project</label>
                <input id="set-project" className={FIELD} value={vercelProject} onChange={(e) => setVercelProject(e.target.value)} placeholder="maxxen" autoComplete="off" />
              </div>
            </div>
            <div>
              <label htmlFor="set-composio" className={LABEL}>Composio key</label>
              <input id="set-composio" className={FIELD} value={composioKey} onChange={(e) => setComposioKey(e.target.value)} placeholder="YOUR key" type="password" autoComplete="off" />
            </div>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={saveAll} disabled={saving} className={BTN_PRIMARY}>
            {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {saving ? "Saving…" : "Save everything"}
          </button>
          <button type="button" onClick={wipeAll} disabled={wiping} className={BTN_DANGER}>
            {wiping ? "Wiping…" : "Forget my vault"}
          </button>
        </div>
        <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-white/30">
          Preferences sync as plain text, keys as AES-256-GCM ciphertext — both in YOUR private maxxen-data repo.
        </p>
      </main>
    </div>
  );
}
