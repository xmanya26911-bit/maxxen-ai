const ALLOWED_FILE = /^(builds\/|chats\/|settings\.json$)/;
const ALLOWED_LIST_DIR = /^(builds(\/.*)?|chats(\/.*)?|settings\.json)?$/;

export function cleanGithubPath(raw: unknown, opts?: { allowRoot?: boolean }): string | null {
  if (typeof raw !== "string") return opts && opts.allowRoot ? "" : null;
  if (raw === "") return opts && opts.allowRoot ? "" : null;
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.length > 200) return null;
  if (p.includes("..") || p.includes("//") || p.endsWith("/") || p.startsWith(".")) return null;
  const first = p.split("/")[0].toLowerCase();
  if (first === ".github" || first === ".git") return null;
  if (opts && opts.allowRoot) {
    if (p === "builds" || p === "chats") return p;
    if (!ALLOWED_LIST_DIR.test(p) && !ALLOWED_FILE.test(p)) return null;
    return p;
  }
  if (p === "settings.json") return p;
  if (!ALLOWED_FILE.test(p)) return null;
  if (p === "builds" || p === "chats" || p === "builds/" || p === "chats/") return null;
  return p;
}