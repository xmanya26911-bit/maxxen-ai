"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, LogOut, TriangleAlert } from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { validateSession } from "@/lib/auth-api";
import { forgetVault, pullVault, pushVault } from "@/lib/sync";
import {
  PROVIDER_IDS,
  PROVIDER_META,
  getProviderKey,
  normalizeProvider,
  setProviderKey,
  type ProviderId,
} from "@/lib/endpoint";

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

/** One connection-state row: ● Connected / ○ Not connected + actions. */
function IntegrationStatus({
  name,
  connected,
  live,
  onRemove,
  action,
}: {
  name: string;
  connected: boolean;
  /** True when liveness was verified against the real service (not just a saved key). */
  live?: boolean;
  onRemove?: () => void;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span
        aria-hidden="true"
        className={connected ? "h-1.5 w-1.5 rounded-full bg-emerald-300" : "h-1.5 w-1.5 rounded-full bg-white/20"}
      />
      <span className="text-[12.5px] font-medium text-white/85">{name}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
        {connected ? (live ? "Connected · verified" : "Connected") : "Not connected"}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {action}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mx-focus font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 transition-colors hover:text-red-200"
          >
            Remove
          </button>
        )}
      </span>
    </li>
  );
}

export function SettingsForm() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("custom");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [vercelProject, setVercelProject] = useState("maxxen");
  const [composioKey, setComposioKey] = useState("");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"ok" | "err" | "info">("info");
  const [saving, setSaving] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [testingComposio, setTestingComposio] = useState(false);
  const [composioState, setComposioState] = useState<"unknown" | "connected" | "failed">("unknown");
  const [composioUserId, setComposioUserId] = useState("");
  const [composioAccounts, setComposioAccounts] = useState<
    { toolkit: string; status: string; id: string; userId: string }[] | null
  >(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

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
      const prov = normalizeProvider(ls("maxxen_provider"));
      setProvider(prov);
      setBaseURL(ls("maxxen_baseurl"));
      setApiKey(getProviderKey(prov));
      setModel(ls("maxxen_model"));
      setGithubToken(ls("maxxen_github_token"));
      setVercelToken(ls("maxxen_vercel_token"));
      setVercelProject(ls("maxxen_vercel_project") || "maxxen");
      setComposioKey(ls("maxxen_composio_key"));
      setComposioUserId(ls("maxxen_composio_user_id"));
      setReady(true);
      const stored = useAuthStore.getState().session;
      if (stored?.token && ls("maxxen_github_token")) {
        const v = await pullVault(stored.token);
        if (v.ok && v.applied > 0) {
          setBaseURL(ls("maxxen_baseurl"));
          setModel(ls("maxxen_model"));
          const syncedProv = normalizeProvider(ls("maxxen_provider"));
          setProvider(syncedProv);
          setApiKey(getProviderKey(syncedProv));
          setGithubToken(ls("maxxen_github_token"));
          setVercelToken(ls("maxxen_vercel_token"));
          setVercelProject(ls("maxxen_vercel_project") || "maxxen");
          setComposioKey(ls("maxxen_composio_key"));
          setComposioUserId(ls("maxxen_composio_user_id"));
          flash(`Synced from YOUR repo — ${v.message}`, "ok");
        }
      }
    })();
  }, []);

  /** Providers holding a saved key (this render's field counts for the active one). */
  const keyedProviders = (Object.keys(PROVIDER_META) as ProviderId[]).filter(
    (id) => getProviderKey(id).trim().length > 0 || (id === provider && apiKey.trim().length > 0)
  );

  const pickPreset = (id: string) => {
    const next = normalizeProvider(id);
    const meta = PROVIDER_META[next];
    // Park the current field into its own provider slot first, so switching
    // providers never mixes keys — then load the incoming provider's world.
    // (Runs only on explicit taps.)
    setProviderKey(provider, apiKey);
    setProvider(next);
    setApiKey(getProviderKey(next));
    setShowKey(false);
    if (next !== "custom") {
      setBaseURL(meta.baseURL);
      setModel(meta.model);
    }
  };

  const saveAll = async () => {
    if (saving) return;
    setSaving(true);
    ls("maxxen_provider", provider);
    ls("maxxen_baseurl", baseURL.trim());
    setProviderKey(provider, apiKey.trim());
    ls("maxxen_model", model.trim());
    ls("maxxen_github_token", githubToken.trim());
    ls("maxxen_vercel_token", vercelToken.trim());
    ls("maxxen_vercel_project", vercelProject.trim() || "maxxen");
    ls("maxxen_composio_key", composioKey.trim());
    ls("maxxen_composio_user_id", composioUserId.trim());
    flash("Saved locally — syncing to YOUR repo…", "info");
    const token = useAuthStore.getState().session?.token ?? "";
    const v = await pushVault(token);
    flash(v.message, v.ok ? "ok" : "err");
    setSaving(false);
  };

  /** Pull one item's identifying fields out of Composio's varied shapes. */
  const toAccountRow = (a: unknown, i: number) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const toolkitObj = o.toolkit as Record<string, unknown> | undefined;
    return {
      toolkit: str(o.toolkit_slug) || (toolkitObj ? str(toolkitObj.slug) : "") || str(o.app) || str(o.provider) || "unknown",
      status: str(o.status) || "unknown",
      id: str(o.id) || str(o.connected_account_id) || `row-${i}`,
      userId:
        str(o.user_id) || str(o.userId) || str(o.entity_id) || str(o.entityId) || "",
    };
  };

  const refreshComposioAccounts = async (key: string) => {
    setLoadingAccounts(true);
    try {
      const r = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composioKey: key }),
      });
      const j = await r.json().catch(() => null);
      const c = j?.connected;
      const list = Array.isArray(c) ? c : c?.items || c?.accounts || c?.data || [];
      setComposioAccounts(Array.isArray(list) ? list.map(toAccountRow) : []);
    } catch {
      setComposioAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const testComposio = async () => {
    const key = composioKey.trim();
    if (!key || testingComposio) return;
    setTestingComposio(true);
    try {
      const r = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composioKey: key }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) {
        setComposioState("connected");
        flash("Composio connected — key works on YOUR account.", "ok");
        await refreshComposioAccounts(key);
      } else {
        setComposioState("failed");
        setComposioAccounts(null);
        flash((j && j.error) || "Composio rejected the key.", "err");
      }
    } catch (e) {
      setComposioState("failed");
      setComposioAccounts(null);
      flash(e instanceof Error ? e.message : "Composio check failed.", "err");
    } finally {
      setTestingComposio(false);
    }
  };

  const disconnect = (which: "github" | "vercel" | "composio" | "endpoint") => {
    if (which === "github") {
      setGithubToken("");
      ls("maxxen_github_token", "");
    } else if (which === "vercel") {
      setVercelToken("");
      ls("maxxen_vercel_token", "");
    } else if (which === "composio") {
      setComposioKey("");
      ls("maxxen_composio_key", "");
      setComposioUserId("");
      ls("maxxen_composio_user_id", "");
      setComposioState("unknown");
      setComposioAccounts(null);
    } else {
      setApiKey("");
      setProviderKey(provider, "");
      ls("maxxen_apikey", "");
    }
    flash("Removed locally — press Save everything to sync the removal.", "info");
  };

  const wipeAll = async () => {
    if (wiping) return;
    if (!window.confirm("Wipe synced keys and preferences? Local chats stay.")) return;
    setWiping(true);
    flash("Wiping vault…", "info");
    const token = useAuthStore.getState().session?.token ?? "";
    const v = await forgetVault(token);
    setApiKey("");
    for (const p of PROVIDER_IDS) setProviderKey(p, "");
    ls("maxxen_apikey", "");
    setGithubToken("");
    setVercelToken("");
    setComposioKey("");
    setComposioUserId("");
    ls("maxxen_composio_user_id", "");
    setComposioState("unknown");
    setComposioAccounts(null);
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
          <div className="flex items-center gap-2">
            <h2 id="endpoint-h" className="text-[15px] font-semibold">AI endpoint</h2>
            <span
              role="status"
              className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50"
            >
              <span
                aria-hidden="true"
                className={
                  baseURL.trim() && apiKey.trim() && model.trim()
                    ? "h-1.5 w-1.5 rounded-full bg-emerald-300"
                    : "h-1.5 w-1.5 rounded-full bg-white/20"
                }
              />
              {baseURL.trim() && apiKey.trim() && model.trim() ? "Configured" : "Not configured"}
            </span>
            {apiKey.trim() && (
              <button
                type="button"
                onClick={() => disconnect("endpoint")}
                className="mx-focus font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/40 transition-colors hover:text-red-200"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Tap a provider, paste the one key, done. Used for every chat generation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Provider presets">
            {PROVIDER_IDS.map((id) => {
              const meta = PROVIDER_META[id];
              const saved = getProviderKey(id).trim().length > 0 || (id === provider && apiKey.trim().length > 0);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickPreset(id)}
                  aria-pressed={provider === id}
                  title={saved ? `${meta.label} — key saved` : `${meta.label} — no key yet`}
                  className={cn(
                    "mx-focus mx-press rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                    provider === id
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                  )}
                >
                  {meta.label}
                  <span aria-hidden="true" className={saved ? "ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" : "ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white/20 align-middle"} />
                </button>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-white/35">
            Each provider keeps its own key — switching never mixes them.
          </p>
          <div className="mt-4 grid gap-3">
            <div>
              <label htmlFor="set-base" className={LABEL}>Base URL</label>
              <input id="set-base" className={FIELD} value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" inputMode="url" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="set-key" className={LABEL}>API key — {PROVIDER_META[provider].label}</label>
              <div className="relative">
                <input
                  id="set-key"
                  className={cn(FIELD, "pr-11")}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="paste key — visible to you only, in this browser"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  aria-describedby="set-key-hint"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  aria-pressed={showKey}
                  title={showKey ? "Hide API key" : "Show API key"}
                  className="mx-focus absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  {showKey ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </div>
              <p id="set-key-hint" className="mt-1 text-[11px] text-white/35">
                Stored only in this browser{provider === "custom" ? ", plus your encrypted vault on Save" : " and your encrypted vault on Save"} — never sent anywhere except your provider.
              </p>
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
          <ul aria-label="Integration connection states" className="mt-3 grid gap-1.5">
            <IntegrationStatus
              name="GitHub"
              connected={githubToken.trim().length > 0}
              onRemove={githubToken.trim() ? () => disconnect("github") : undefined}
            />
            <IntegrationStatus
              name="Vercel"
              connected={vercelToken.trim().length > 0}
              onRemove={vercelToken.trim() ? () => disconnect("vercel") : undefined}
            />
            <IntegrationStatus
              name="Composio"
              connected={composioState === "connected" || (composioState === "unknown" && composioKey.trim().length > 0)}
              live={composioState === "connected"}
              onRemove={composioKey.trim() ? () => disconnect("composio") : undefined}
              action={
                <button
                  type="button"
                  onClick={testComposio}
                  disabled={testingComposio || !composioKey.trim()}
                  className="mx-focus font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-white disabled:opacity-40"
                >
                  {testingComposio ? "Testing…" : "Test"}
                </button>
              }
            />
          </ul>
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
              <input id="set-composio" className={FIELD} value={composioKey} onChange={(e) => { setComposioKey(e.target.value); setComposioState("unknown"); setComposioAccounts(null); }} placeholder="YOUR key" type="password" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="set-composio-uid" className={LABEL}>Composio user ID (which connected account acts)</label>
              <input
                id="set-composio-uid"
                className={FIELD}
                value={composioUserId}
                onChange={(e) => setComposioUserId(e.target.value)}
                placeholder="e.g. you@gmail.com — pick from your accounts below"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                Find it below: Test the key, then choose Use next to the account you want Maxxen to act as.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2">
              <p className={LABEL} style={{ marginBottom: 0 }}>Your connected accounts</p>
              <button
                type="button"
                onClick={() => composioKey.trim() && refreshComposioAccounts(composioKey.trim())}
                disabled={loadingAccounts || !composioKey.trim()}
                className="mx-focus font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-white disabled:opacity-40"
              >
                {loadingAccounts ? "Loading…" : "Show connections"}
              </button>
            </div>
            {composioAccounts === null ? (
              <p className="text-[12px] text-white/35">Test the key above to list the accounts on YOUR Composio project.</p>
            ) : composioAccounts.length === 0 ? (
              <p className="text-[12px] text-white/35">
                No connected accounts yet — connect Gmail, GitHub, … at app.composio.dev, then Show connections again.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {composioAccounts.map((a, i) => (
                  <li
                    key={`${a.id}-${i}`}
                    className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        a.status.toLowerCase() === "active"
                          ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300"
                          : "h-1.5 w-1.5 shrink-0 rounded-full bg-white/25"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-white/85">{a.toolkit}</p>
                      <p className="truncate font-mono text-[10px] text-white/40">
                        {a.status}
                        {a.userId ? ` · user: ${a.userId}` : " · no user id shown"}
                        {a.id.startsWith("row-") ? "" : ` · ${a.id.slice(0, 18)}`}
                      </p>
                    </div>
                    {a.userId && (
                      <button
                        type="button"
                        onClick={() => {
                          setComposioUserId(a.userId);
                          ls("maxxen_composio_user_id", a.userId);
                          flash(`Using "${a.userId}" for Composio actions — press Save everything.`, "info");
                        }}
                        aria-label={`Use ${a.userId} for Composio actions`}
                        className={
                          composioUserId.trim() === a.userId
                            ? "mx-focus shrink-0 rounded-md bg-white px-2.5 py-1.5 font-mono text-[10.5px] font-semibold text-black"
                            : "mx-focus shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[10.5px] text-white/60 transition-colors hover:text-white"
                        }
                      >
                        {composioUserId.trim() === a.userId ? "Using ✓" : "Use"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
