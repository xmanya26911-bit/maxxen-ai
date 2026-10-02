/**
 * Agent project-context detection — `.opencode/` and friends.
 *
 * When Maxxen opens a repository it looks for well-known agent-config
 * directories and surfaces their SAFE configuration as agent context:
 *   .opencode/  (OpenCode project config)
 *   .claude/    (Claude Code project config)
 *   .cursor/    (Cursor project rules)
 *   .windsurf/  (Windsurf project config)
 *   .roo/       (Roo Code project config)
 *
 * HARD RULES (security, non-negotiable):
 * - Detection is READ-ONLY. Nothing here writes, executes, or installs.
 * - Only small text files with allowlisted names/extensions are read, each
 *   capped (MAX_FILE_BYTES) and the whole context capped (MAX_TOTAL_BYTES).
 * - Credential-bearing names (auth.json, credentials.json, *.key, .env,
 *   secrets.*) are NEVER read, even if listed — see DENIED_NAMES.
 * - Path traversal is rejected (no "..", no absolute paths).
 * - CRITICALLY: ".opencode/ provides project configuration/context. It does
 *   not grant access to OpenCode-hosted models." Detection of the directory
 *   is NEVER treated as proof of OpenCode authentication, and nothing here
 *   reads OpenCode credentials from anywhere.
 *
 * Isomorphic and dependency-free: the same parser runs in the server route
 * (against GitHub listings) and in unit tests (against fixtures).
 */

export const SUPPORTED_DIRS = [".opencode", ".claude", ".cursor", ".windsurf", ".roo"] as const;
export type SupportedDir = (typeof SUPPORTED_DIRS)[number];

/** Files that may carry credentials — never read, never excerpted. */
const DENIED_NAMES = new Set([
  "auth.json",
  "credentials.json",
  "credentials.jsonc",
  "token.json",
  "tokens.json",
  "secrets.json",
  ".env",
  "id_rsa",
  "id_ed25519",
]);
const DENIED_SUFFIXES = [".key", ".pem", ".p12", ".pfx", ".env"];

const ALLOWED_EXTENSIONS = new Set([".json", ".jsonc", ".md", ".markdown", ".yaml", ".yml", ".txt"]);
const ALLOWED_BASENAMES = new Set([
  "opencode.json",
  "opencode.jsonc",
  "config.json",
  "settings.json",
  "agents.md",
  "claude.md",
  "instructions.md",
  "rules.md",
]);

export const MAX_FILE_BYTES = 50 * 1024;
export const MAX_FILES = 10;
export const MAX_TOTAL_BYTES = 200 * 1024;

export interface DirListing {
  /** Directory-relative path, e.g. ".opencode/opencode.json". */
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface ProjectContextFile {
  dir: SupportedDir;
  path: string;
  kind: "json" | "text";
  /** Parsed JSON, or a size-capped text excerpt when not valid JSON. */
  content: unknown;
  truncated: boolean;
}

export interface ProjectContext {
  detected: SupportedDir[];
  files: ProjectContextFile[];
  /** Markdown summary safe to append to an agent system prompt. */
  markdown: string;
  omitted: string[];
}

function safeName(path: string): string {
  return path.split("/").pop()!.toLowerCase();
}

/** Whether this listed file may be read. Pure allowlist + denylist check. */
export function isReadableConfig(path: string, size?: number): boolean {
  const name = safeName(path);
  if (DENIED_NAMES.has(name)) return false;
  if (DENIED_SUFFIXES.some((s) => name.endsWith(s))) return false;
  if (typeof size === "number" && size > MAX_FILE_BYTES) return false;
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  return ALLOWED_BASENAMES.has(name) || (ext !== "" && ALLOWED_EXTENSIONS.has(ext));
}

/** Reject traversal/absolute paths before any read is attempted. */
export function isSafePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  return true;
}

/** Which supported config dirs appear in a flat repository listing. */
export function detectDirs(entries: { path: string; type: string }[]): SupportedDir[] {
  const tops = new Set(entries.map((e) => e.path.split("/")[0]));
  return SUPPORTED_DIRS.filter((d) => tops.has(d));
}

/** Candidate config files under a supported dir, in a safe read order. */
export function candidateFiles(entries: DirListing[], dir: SupportedDir): DirListing[] {
  const prefix = `${dir}/`;
  return entries
    .filter((e) => e.type === "file" && e.path.startsWith(prefix) && isSafePath(e.path))
    .filter((e) => isReadableConfig(e.path, e.size))
    .slice(0, MAX_FILES);
}

/** Parse one fetched file: JSON when valid, capped text excerpt otherwise. */
export function parseConfigFile(dir: SupportedDir, path: string, text: string): ProjectContextFile {
  const name = safeName(path);
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  const isJson = ext === ".json" || ext === ".jsonc";
  const slice = text.slice(0, MAX_FILE_BYTES);
  const truncated = text.length > MAX_FILE_BYTES;
  if (isJson) {
    try {
      // Strip block and line comments for jsonc tolerance (best-effort).
      const decommented = slice
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/[^\n]*/g, "$1");
      return { dir, path, kind: "json", content: JSON.parse(decommented), truncated };
    } catch {
      /* fall through to text excerpt */
    }
  }
  return { dir, path, kind: "text", content: slice, truncated };
}

/** Assemble the agent-facing markdown (already size-capped by construction). */
export function buildProjectContext(files: ProjectContextFile[], omitted: string[]): ProjectContext {
  const detected = Array.from(new Set(files.map((f) => f.dir)));
  let bytes = 0;
  const chunks: string[] = [];
  for (const f of files) {
    const body = f.kind === "json" ? JSON.stringify(f.content, null, 2)!.slice(0, MAX_FILE_BYTES) : String(f.content);
    const chunk = `### ${f.path}\n\`\`\`\n${body}\n\`\`\``;
    if (bytes + chunk.length > MAX_TOTAL_BYTES) {
      omitted.push(`${f.path} (context budget)`);
      continue;
    }
    bytes += chunk.length;
    chunks.push(chunk);
  }
  const names = detected.length ? detected.join(", ") : "none";
  const markdown =
    `Project agent configuration detected (${names}). ` +
    `This is workspace context only — it never implies model access or credentials.\n\n` +
    chunks.join("\n\n");
  return { detected, files, markdown, omitted };
}
