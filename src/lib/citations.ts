/**
 * Sources + citations — first-class retrieved-source objects (Phase 6).
 *
 * The agent assigns stable [sN] ids to successful web_search/fetch_webpage
 * results; answers cite those ids. Rendering resolves ids against the
 * message's own sources: matched ids become links, unmatched markers stay
 * plain text (a citation is never fabricated into a link).
 * `kind` distinguishes search snippets from fully-read pages — a snippet is
 * never presented as a page read. Isomorphic, dependency-free.
 */

export interface Source {
  id: string;
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
  publishedAt?: string;
  kind: "snippet" | "page";
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Build a Source or null (invalid URL, empty title). Never throws. */
export function buildSource(
  id: string,
  input: { title?: unknown; url?: unknown; snippet?: unknown; publishedAt?: unknown; published?: unknown; kind?: unknown }
): Source | null {
  const url = cleanStr(input.url, 500);
  const title = cleanStr(input.title, 200);
  if (!url || !title) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const snippet = cleanStr(input.snippet, 400) || undefined;
  const publishedAt = cleanStr(input.publishedAt, 40) || cleanStr(input.published, 40) || undefined;
  return {
    id,
    title,
    url,
    domain: domainOf(url) || undefined,
    ...(snippet ? { snippet } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    kind: input.kind === "page" ? "page" : "snippet",
  };
}

/** Collect citable sources from one tool result (order-stable, capped). */
export function collectRunSources(toolId: string, data: unknown, startSeq: number): Source[] {
  const out: Source[] = [];
  const push = (raw: unknown, kind: "snippet" | "page") => {
    if (out.length >= 10) return;
    const s = buildSource(`s${startSeq + out.length + 1}`, { ...(typeof raw === "object" && raw !== null ? raw : {}), kind });
    if (s) out.push(s);
  };
  if (toolId === "web_search" && Array.isArray(data)) {
    for (const d of data.slice(0, 10)) push(d, "snippet");
  } else if (toolId === "fetch_webpage" && data && typeof data === "object") {
    push(data, "page");
  }
  return out;
}

export type CitationPart = { text: string } | { ref: string };

/** Split `[sN]` markers out of assistant text (unmatched stays text). */
export function splitCitationMarkers(content: string): CitationPart[] {
  const parts: CitationPart[] = [];
  const re = /\[s(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ text: content.slice(last, m.index) });
    parts.push({ ref: `s${m[1]}` });
    last = m.index + m[0].length;
  }
  if (last < content.length || !parts.length) parts.push({ text: content.slice(last) });
  return parts;
}

/**
 * Rewrite resolved `[sN]` markers as markdown links for the existing renderer.
 * Unresolved markers pass through untouched — never a fabricated link.
 */
export function linkifyCitations(content: string, sources?: Source[]): string {
  if (!sources?.length || !content.includes("[s")) return content;
  const byId = new Map(sources.map((s) => [s.id, s]));
  return content.replace(/\[s(\d+)\]/g, (m, n: string) => {
    const s = byId.get(`s${n}`);
    if (!s) return m;
    const title = s.title.replace(/"/g, "");
    return `[${m}](${s.url} "${title}")`;
  });
}
