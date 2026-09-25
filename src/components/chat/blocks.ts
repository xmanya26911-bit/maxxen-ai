/**
 * Artifact extraction — pulls fenced code blocks out of assistant content,
 * mirroring the real MAXXEN client: the first token after ``` is the
 * language, and a second token containing a dot is treated as a file path
 * (e.g. ```html index.html, ```tsx app/page.tsx).
 */
import type { CodeBlock } from "./types";

/** Stable identity for version tracking: explicit path, else language bucket. */
export function blockKey(b: Pick<CodeBlock, "lang" | "path">): string {
  return b.path || `${b.lang}:snippet`;
}

/** Languages the workspace pane knows how to render. */
export const CODE_LANGS: ReadonlySet<string> = new Set([
  "html",
  "tsx",
  "jsx",
  "ts",
  "js",
  "javascript",
  "css",
  "python",
  "py",
  "json",
  "bash",
  "sh",
  "sql",
  "yaml",
  "yml",
  "markdown",
  "md",
  "txt",
]);

/** Language → file extension, used for synthesized "untitled-N" artifact names. */
const EXT_FOR: Readonly<Record<string, string>> = {
  html: "html",
  tsx: "tsx",
  jsx: "jsx",
  ts: "ts",
  js: "js",
  javascript: "js",
  css: "css",
  python: "py",
  py: "py",
  json: "json",
  bash: "sh",
  sh: "sh",
  sql: "sql",
  yaml: "yml",
  yml: "yml",
  markdown: "md",
  md: "md",
  txt: "txt",
};

/** Maps a fence language to a file extension (fallback "txt"). */
export function extFor(lang: string): string {
  return EXT_FOR[lang.toLowerCase()] ?? "txt";
}

const FENCE_OPEN = /^\s*```(.*)$/;
const FENCE_CLOSE = /^\s*```\s*$/;

/**
 * Extracts code blocks from markdown content, in order of appearance.
 * - lang = first whitespace-delimited token after ``` (lower-cased)
 * - path = second token, only when it contains a dot
 * - fences with an unknown lang AND no path meta are skipped (same as the real app)
 * - blocks with an empty code body are skipped
 * - an unclosed final fence is consumed to the end of the content so the
 *   live preview can render an artifact while it is still streaming
 */
export function extractBlocks(content: string): CodeBlock[] {
  if (!content.includes("```")) return [];
  const blocks: CodeBlock[] = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) {
      i += 1;
      continue;
    }
    const tokens = open[1].trim().split(/\s+/).filter(Boolean);
    const lang = (tokens[0] ?? "").toLowerCase();
    const path = tokens[1] && tokens[1].includes(".") ? tokens[1] : undefined;
    i += 1;
    // Not an artifact fence: no known language and no path meta.
    if (!CODE_LANGS.has(lang) && !path) continue;
    const body: string[] = [];
    while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
      body.push(lines[i]);
      i += 1;
    }
    if (i < lines.length) i += 1; // consume the closing fence
    const code = body.join("\n");
    if (code.trim().length === 0) continue;
    blocks.push(path ? { lang, code, path } : { lang, code });
  }
  return blocks;
}
