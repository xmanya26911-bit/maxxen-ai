import crypto from "node:crypto";
import { serverSecret } from "./session";

const COOKIE = "maxxen-github-token";
const MAX_AGE = 30 * 24 * 60 * 60;

function key(): Buffer {
  return crypto.createHash("sha256").update(`${serverSecret()}|github-token-cookie`).digest();
}

function seal(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

function unseal(value: string): string | null {
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function readCookie(req: Request): string {
  const cookies = req.headers.get("cookie") || "";
  const match = cookies.match(/(?:^|; )maxxen-github-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function getGithubTokenCookie(req: Request): string | null {
  const value = readCookie(req);
  return value ? unseal(value) : null;
}

export function setGithubTokenCookie(res: Response, token: string): void {
  const value = encodeURIComponent(seal(token.trim()));
  const secure = process.env.NODE_ENV === "production";
  res.headers.append(
    "Set-Cookie",
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`,
  );
}

export function clearGithubTokenCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production";
  res.headers.append(
    "Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`,
  );
}
