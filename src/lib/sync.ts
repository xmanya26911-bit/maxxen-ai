// Browser-side vault sync. Server (per-gmail encrypted vault in the user's
// own GitHub repo) is the source of truth; localStorage is a fast cache.
// All network failures are best-effort: the UI always keeps working offline
// with whatever is cached locally.

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

// localStorage key -> vault field
const PREF_MAP: Record<string, string> = {
  maxxen_baseurl: "baseURL",
  maxxen_model: "model",
  maxxen_provider: "provider",
  maxxen_vercel_project: "vercelProject",
};
const SECRET_MAP: Record<string, string> = {
  maxxen_apikey: "apiKey",
  maxxen_composio_key: "composioKey",
  maxxen_github_token: "githubToken",
  maxxen_vercel_token: "vercelToken",
};

export async function pullVault(session: string): Promise<{ ok: boolean; applied: number; message: string }> {
  try {
    const githubToken = ls("maxxen_github_token");
    if (!githubToken) return { ok: false, applied: 0, message: "Add your GitHub token once — then everything syncs per account." };
    const r = await fetch("/api/vault/load", {
      method: "POST",
      body: JSON.stringify({ session, githubToken }),
    });
    const j = await r.json();
    if (j.error) return { ok: false, applied: 0, message: j.error };
    let applied = 0;
    const prefs = j.prefs || {};
    for (const [local, remote] of Object.entries(PREF_MAP)) {
      if (typeof prefs[remote] === "string" && prefs[remote]) {
        ls(local, prefs[remote]);
        applied++;
      }
    }
    const secrets = j.secrets || {};
    for (const [local, remote] of Object.entries(SECRET_MAP)) {
      if (typeof secrets[remote] === "string" && secrets[remote]) {
        ls(local, secrets[remote]);
        applied++;
      }
    }
    if (j.fresh) return { ok: true, applied: 0, message: "Fresh vault created for this account." };
    return { ok: true, applied, message: applied ? `Restored ${applied} synced item${applied === 1 ? "" : "s"}.` : "Vault empty — save once to start syncing." };
  } catch (e: any) {
    return { ok: false, applied: 0, message: e.message || "Sync failed — using local values." };
  }
}

export async function pushVault(session: string): Promise<{ ok: boolean; message: string }> {
  try {
    const githubToken = ls("maxxen_github_token");
    if (!githubToken) return { ok: false, message: "Saved locally. Add your GitHub token to sync per account." };
    const prefs: Record<string, string> = {};
    for (const [local, remote] of Object.entries(PREF_MAP)) {
      const v = ls(local);
      if (v) prefs[remote] = v;
    }
    const secrets: Record<string, string> = {};
    for (const [local, remote] of Object.entries(SECRET_MAP)) {
      const v = ls(local);
      if (v) secrets[remote] = v;
    }
    const r = await fetch("/api/vault/save", {
      method: "POST",
      body: JSON.stringify({ session, githubToken, prefs, secrets }),
    });
    const j = await r.json();
    if (j.error) return { ok: false, message: j.error };
    return { ok: true, message: j.savedSecrets ? "Synced + encrypted to YOUR repo." : "Preferences synced to YOUR repo." };
  } catch (e: any) {
    return { ok: false, message: e.message || "Sync failed — kept locally." };
  }
}

export async function forgetVault(session: string): Promise<{ ok: boolean; message: string }> {
  // Complete reset: server wipes prefs + vault (wipe:true), browser drops
  // every maxxen_* key except the login session itself.
  const KEEP = new Set(["maxxen_session", "maxxen_otp_email", "maxxen_otp_ticket", "maxxen_chats", "maxxen_open_chat"]);
  try {
    const githubToken = ls("maxxen_github_token");
    if (githubToken) {
      await fetch("/api/vault/save", {
        method: "POST",
        body: JSON.stringify({ session, githubToken, prefs: {}, secrets: {}, wipe: true }),
      });
    }
    if (typeof window !== "undefined") {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i) || "";
        if (k.startsWith("maxxen_") && !KEEP.has(k)) localStorage.removeItem(k);
      }
    }
    return { ok: true, message: "Vault, keys and preferences wiped. Your conversations were kept." };
  } catch (e: any) {
    return { ok: false, message: e.message || "Forget failed." };
  }
}
