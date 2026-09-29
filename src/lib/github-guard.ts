// Shared GitHub path guard — all user-repo routes must use this.
// Allows: repo root "" (list only), builds/, chats/, settings.json
// Rejects: .., //, leading /, backslashes, >200 chars, hidden .github/, workflows, etc.

const ALLOWED_FILE = /^(builds\/|chats\/|memory\/|settings\.json$)/;
const ALLOWED_LIST_DIR = /^(builds(\/.*)?|chats(\/.*)?|settings\.json)?$/;

export function cleanGithubPath(raw: unknown, opts?: { allowRoot?: boolean }): string | null {
  if (typeof raw !== "string") {
    return opts?.allowRoot ? "" : null;
  }
  if (raw === "") return opts?.allowRoot ? "" : null;
  // normalize slashes, strip leading slashes
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.length > 200) return null;
  if (p.includes("..") || p.includes("//") || p.endsWith("/") || p.startsWith(".")) return null;
  // reject hidden dirs and github meta
  const first = p.split("/")[0].toLowerCase();
  if (first === ".github" || first === ".git") return null;
  if (opts?.allowRoot) {
    if (p === "builds" || p === "chats") return p;
    if (!ALLOWED_LIST_DIR.test(p) && !ALLOWED_FILE.test(p)) return null;
    return p;
  }
  // file routes: must be a file under builds/ or chats/, or settings.json exactly
  if (p === "settings.json") return p;
  if (!ALLOWED_FILE.test(p)) return null;
  // must look like a file (has extension or nested path), not bare "builds"
  if (p === "builds" || p === "chats" || p === "builds/" || p === "chats/") return null;
  return p;
}
