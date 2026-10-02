import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import crypto from "node:crypto";
import { serverSecret, verifySession } from "@/lib/session";

const TABLE = "maxxen_account_connections";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function vaultKey(): Buffer {
  const raw = env("MAXXEN_ACCOUNT_VAULT_KEY");
  if (!raw) throw new Error("MAXXEN_ACCOUNT_VAULT_KEY is not configured.");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MAXXEN_ACCOUNT_VAULT_KEY must be 32 bytes (64 hex or 44 base64 chars).");
  return key;
}

function supabaseConfig() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Cloud account storage is not configured.");
  return { url, serviceKey };
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((x) => x.toString("base64url")).join(".");
}

function decrypt(value: string): string {
  const [ivRaw, tagRaw, dataRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("Invalid encrypted credential.");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

async function supabase(path: string, init: RequestInit = {}) {
  const { url, serviceKey } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cloud account storage failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

export function sessionEmail(req: Request): string | null {
  const token = req.headers.get("x-maxxen-session") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return token ? verifySession(token) : null;
}

export async function getLinkedGithubToken(email: string): Promise<string | null> {
  const res = await supabase(`${TABLE}?email=eq.${encodeURIComponent(email.toLowerCase())}&select=github_token_encrypted&limit=1`);
  const rows = await res.json().catch(() => []);
  const encrypted = Array.isArray(rows) ? rows[0]?.github_token_encrypted : null;
  return typeof encrypted === "string" ? decrypt(encrypted) : null;
}

export async function linkGithubToken(email: string, token: string, replace = false): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const clean = token.trim();
  if (!clean || clean.length > 500) throw new Error("Invalid GitHub token.");
  if (!replace) {
    const existing = await getLinkedGithubToken(normalized);
    if (existing) return;
  }
  await supabase(TABLE, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      email: normalized,
      github_token_encrypted: encrypt(clean),
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function linkGithubOAuth(email: string, data: { accessToken: string; refreshToken?: string; accessExpiresAt?: number; githubId: number; login: string }): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!data.accessToken || !Number.isFinite(data.githubId) || !data.login) throw new Error("Invalid GitHub OAuth credential.");
  await supabase(TABLE, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      email: normalized,
      github_id: data.githubId,
      github_login: data.login.slice(0, 100),
      github_access_token_encrypted: encrypt(data.accessToken),
      github_refresh_token_encrypted: data.refreshToken ? encrypt(data.refreshToken) : null,
      github_access_expires_at: data.accessExpiresAt ? new Date(data.accessExpiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function getLinkedGithubOAuth(email: string): Promise<{ accessToken: string; refreshToken: string | null; accessExpiresAt: number | null; login: string; githubId: number } | null> {
  const res = await supabase(`${TABLE}?email=eq.${encodeURIComponent(email.toLowerCase())}&select=github_access_token_encrypted,github_refresh_token_encrypted,github_access_expires_at,github_login,github_id&limit=1`);
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.github_access_token_encrypted || !row?.github_id || !row?.github_login) return null;
  return {
    accessToken: decrypt(row.github_access_token_encrypted),
    refreshToken: typeof row.github_refresh_token_encrypted === "string" ? decrypt(row.github_refresh_token_encrypted) : null,
    accessExpiresAt: row.github_access_expires_at ? Date.parse(row.github_access_expires_at) : null,
    login: String(row.github_login),
    githubId: Number(row.github_id),
  };
}

export function signGithubOAuthState(email: string, nonce: string): string {
  const payload = `${email.toLowerCase()}|${nonce}|${Date.now()}`;
  const sig = crypto.createHmac("sha256", serverSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyGithubOAuthState(state: string): { email: string; nonce: string } | null {
  try {
    const parts = Buffer.from(state, "base64url").toString().split("|");
    if (parts.length !== 4) return null;
    const [email, nonce, issued, sig] = parts;
    const issuedN = Number(issued);
    if (!email || !nonce || !Number.isFinite(issuedN) || Date.now() - issuedN > 10 * 60 * 1000) return null;
    const payload = `${email}|${nonce}|${issued}`;
    const expected = crypto.createHmac("sha256", serverSecret()).update(payload).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { email, nonce };
  } catch { return null; }
}

export async function unlinkGithubToken(email: string): Promise<void> {
  await supabase(`${TABLE}?email=eq.${encodeURIComponent(email.toLowerCase())}`, { method: "DELETE" });
}
