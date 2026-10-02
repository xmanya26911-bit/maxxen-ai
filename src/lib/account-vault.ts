import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { verifySession } from "@/lib/session";

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

export async function linkGithubToken(email: string, token: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const clean = token.trim();
  if (!clean || clean.length > 500) throw new Error("Invalid GitHub token.");
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

export async function unlinkGithubToken(email: string): Promise<void> {
  await supabase(`${TABLE}?email=eq.${encodeURIComponent(email.toLowerCase())}`, { method: "DELETE" });
}
