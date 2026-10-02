import crypto from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { serverSecret } from "./session";

const PREFIX = "maxxen/accounts/";
const PRIVATE = { access: "private" as const };

function accountPath(email: string): string {
  const id = crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `${PREFIX}${id}.json`;
}

function vaultKey(email: string): Buffer {
  return crypto.createHash("sha256").update(`${serverSecret()}|account-vault|${email.trim().toLowerCase()}`).digest();
}

type TokenPacket = { iv: string; tag: string; data: string };
type StoredAccount = {
  version: 1;
  emailHash: string;
  updatedAt: string;
  githubToken: TokenPacket;
};

function encrypt(email: string, token: string): TokenPacket {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(email), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), data: data.toString("base64url") };
}

function decrypt(email: string, packet: TokenPacket): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(email), Buffer.from(packet.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(packet.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(packet.data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function readAccount(email: string): Promise<StoredAccount | null> {
  try {
    const result = await get(accountPath(email), { ...PRIVATE, useCache: false });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1 || typeof parsed.githubToken !== "object") return null;
    return parsed as StoredAccount;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404/i.test(message)) return null;
    throw error;
  }
}

export async function getLinkedGithubToken(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const account = await readAccount(normalized);
  return account ? decrypt(normalized, account.githubToken) : null;
}

export async function linkGithubToken(email: string, token: string, replace = false): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const clean = token.trim();
  if (!clean || clean.length > 500) throw new Error("Invalid GitHub token.");
  if (!replace && (await getLinkedGithubToken(normalized))) return;

  const body: StoredAccount = {
    version: 1,
    emailHash: crypto.createHash("sha256").update(normalized).digest("hex"),
    updatedAt: new Date().toISOString(),
    githubToken: encrypt(normalized, clean),
  };

  await put(accountPath(normalized), JSON.stringify(body), {
    ...PRIVATE,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function unlinkGithubToken(email: string): Promise<void> {
  try {
    await del(accountPath(email));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found|404/i.test(message)) throw error;
  }
}
