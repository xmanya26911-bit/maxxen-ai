// Seamless GitHub-backed sync: localStorage is the instant cache; the user's private
// maxxen-data repo is the durable source of truth. GitHub credentials never live in localStorage.

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k); else localStorage.setItem(k, v);
  return v;
};

const PREF_MAP: Record<string, string> = {
  maxxen_baseurl: "baseURL", maxxen_model: "model", maxxen_provider: "provider",
  maxxen_vercel_project: "vercelProject", maxxen_composio_user_id: "composioUserId",
  maxxen_memory_auto: "memoryAuto",
  maxxen_search_enabled: "searchEnabled", maxxen_search_max: "searchMax",
  maxxen_timezone: "timezone",
};
const SECRET_MAP: Record<string, string> = {
  maxxen_apikey: "apiKey", maxxen_apikey_openai: "apiKeyOpenai",
  maxxen_apikey_anthropic: "apiKeyAnthropic", maxxen_apikey_gemini: "apiKeyGemini",
  maxxen_apikey_custom: "apiKeyCustom", maxxen_apikey_opencode: "apiKeyOpencode",
  maxxen_composio_key: "composioKey", maxxen_vercel_token: "vercelToken",
};
const DELETED_KEY = "maxxen_sync_deleted";
const READY_KEY = "maxxen_sync_ready";
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<{ ok: boolean; message: string }> | null = null;

function deleted(): Record<string, "prefs" | "secrets"> {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) || "{}"); } catch { return {}; }
}
function markDeleted(local: string, kind: "prefs" | "secrets") {
  const d = deleted(); d[local] = kind; localStorage.setItem(DELETED_KEY, JSON.stringify(d));
}
function clearDeleted() { localStorage.removeItem(DELETED_KEY); }

export function scheduleVaultSync(session: string, delay = 700) {
  if (typeof window === "undefined" || !session || localStorage.getItem(READY_KEY) !== "1") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void pushVault(session); }, delay);
}

export async function pullVault(session: string): Promise<{ ok: boolean; applied: number; message: string }> {
  try {
    const r = await fetch("/api/vault/load", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ session }), cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok || j.error) return { ok: false, applied: 0, message: j.error || "Sync failed." };
    let applied = 0;
    for (const [local, remote] of Object.entries(PREF_MAP)) {
      if (typeof j.prefs?.[remote] === "string") { ls(local, j.prefs[remote]); applied++; }
      else ls(local, "__DEL__");
    }
    for (const [local, remote] of Object.entries(SECRET_MAP)) {
      if (typeof j.secrets?.[remote] === "string") { ls(local, j.secrets[remote]); applied++; }
      else ls(local, "__DEL__");
    }
    clearDeleted(); localStorage.setItem(READY_KEY, "1");
    return { ok: true, applied, message: j.fresh ? "GitHub sync ready." : "Synced " + applied + " item" + (applied === 1 ? "" : "s") + "." };
  } catch (e: any) {
    return { ok: false, applied: 0, message: e?.message || "Sync unavailable — using local cache." };
  }
}

export async function pushVault(session: string): Promise<{ ok: boolean; message: string }> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const prefs: Record<string, string> = {};
      for (const [local, remote] of Object.entries(PREF_MAP)) { const v = ls(local); if (v) prefs[remote] = v; }
      const secrets: Record<string, string> = {};
      for (const [local, remote] of Object.entries(SECRET_MAP)) { const v = ls(local); if (v) secrets[remote] = v; }
      const d = deleted();
      const deletePrefs = Object.keys(d).filter(k => d[k] === "prefs").map(k => PREF_MAP[k]).filter(Boolean);
      const deleteSecrets = Object.keys(d).filter(k => d[k] === "secrets").map(k => SECRET_MAP[k]).filter(Boolean);
      const r = await fetch("/api/vault/save", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, prefs, secrets, deletePrefs, deleteSecrets }), cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || j.error) return { ok: false, message: j.error || "Sync failed." };
      clearDeleted(); localStorage.setItem(READY_KEY, "1");
      return { ok: true, message: "Synced to your private GitHub data." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Sync unavailable — kept locally." };
    } finally { inFlight = null; }
  })();
  return inFlight;
}

export async function forgetVault(session: string): Promise<{ ok: boolean; message: string }> {
  // Keep auth + conversations; wipe synced settings/secrets only. Keys here
  // are the CURRENT storage keys (chat store "maxxen-chat-v1", auth store
  // "maxxen-auth-v1") — legacy names from earlier worklogs are intentionally
  // absent so a wipe can never strand a live session or delete chats.
  const KEEP = new Set(["maxxen-auth-v1", "maxxen-chat-v1", "maxxen_memory_auto"]);
  try {
    await fetch("/api/vault/save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, prefs: {}, secrets: {}, wipe: true }), cache: "no-store",
    });
    if (typeof window !== "undefined") {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i) || "";
        if (k.startsWith("maxxen_") && !KEEP.has(k)) localStorage.removeItem(k);
      }
    }
    return { ok: true, message: "Vault and synced settings wiped. Conversations were kept." };
  } catch (e: any) { return { ok: false, message: e?.message || "Forget failed." }; }
}

export function noteLocalChange(localKey: string) {
  const kind = PREF_MAP[localKey] ? "prefs" : SECRET_MAP[localKey] ? "secrets" : null;
  if (!kind || typeof window === "undefined") return;
  if (!localStorage.getItem(localKey)) markDeleted(localKey, kind);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    try {
      // The canonical session lives in the persisted auth store
      // ("maxxen-auth-v1"); the legacy "maxxen_session" key is long gone.
      const raw = window.localStorage.getItem("maxxen-auth-v1") || "{}";
      const session = (JSON.parse(raw) as { state?: { session?: { token?: string } } }).state?.session?.token || "";
      if (session && localStorage.getItem(READY_KEY) === "1") void pushVault(session);
    } catch {
      /* storage unavailable — stay local */
    }
  });
}
