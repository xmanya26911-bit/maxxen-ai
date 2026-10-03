import crypto from "crypto";
import { serverSecret } from "./session";

// Per-user encrypted vault, stored in the USER's own maxxen-data repo.
// Honest security model (shown in the UI, not hidden):
// - Secrets are AES-256-GCM encrypted before they touch GitHub.
// - The encryption key lives only on the app server (OTP_SECRET, else the
//   Gmail app password). Nobody with just the repo can read them.
// - Trade-off vs browser-only: the server operator COULD decrypt. This vault
//   exists because users asked for cross-tab persistence; a "Forget" action
//   wipes it. Nothing here is ever logged or committed anywhere else.
export const SETTINGS_PATH = "settings.json";

function vaultKey(email: string) {
  return crypto.createHash("sha256").update(`${serverSecret()}|vault|${email.toLowerCase()}`).digest();
}

export type VaultPacket = { iv: string; tag: string; data: string };

export function sealSecrets(email: string, secrets: Record<string, string>): VaultPacket {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(email), iv);
  const plain = JSON.stringify(secrets);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: enc.toString("base64url"),
  };
}

export function openSecrets(email: string, packet: VaultPacket): Record<string, string> {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) throw new Error("bad vault");
  const { iv, tag, data } = packet as { iv?: unknown; tag?: unknown; data?: unknown };
  if (typeof iv !== "string" || typeof tag !== "string" || typeof data !== "string") throw new Error("bad vault");
  if (!iv || !tag || !data || iv.length > 100 || tag.length > 100 || data.length > 200_000) throw new Error("bad vault");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    vaultKey(email),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const obj = JSON.parse(plain);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("bad vault");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (BLOCKED_KEYS.has(k)) continue;
    if (typeof v === "string" && v.length < 8000 && /^[a-zA-Z0-9_]+$/.test(k)) out[k] = v;
  }
  return out;
}

export type StoredSettings = {
  updatedAt: string;
  prefs: Record<string, string>;
  vault?: VaultPacket | null;
};

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export function sanitizePrefs(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (BLOCKED_KEYS.has(k)) continue;
    if (typeof v === "string" && v.length < 4000 && /^[a-zA-Z0-9_]+$/.test(k)) out[k] = v;
  }
  return out;
}
