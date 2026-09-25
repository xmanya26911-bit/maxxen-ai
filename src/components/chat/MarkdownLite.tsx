"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/**
 * MarkdownLite — tiny, dependency-free, injection-proof markdown renderer
 * for assistant messages. Every token becomes a React element (no
 * dangerouslySetInnerHTML), so user/model content can never inject markup.
 *
 * Supported: ```fenced code``` (chrome card + copy), `inline code`,
 * **bold**, *italic*, ## / ### headings, - bullets, 1. ordered lists,
 * [text](url) links, paragraphs with preserved newlines.
 */

/** Inline tokens: code | bold | italic | link (order matters: bold before italic). */
const INLINE_PATTERN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

// Fence info string: lang token + optional path token (```html index.html).
const FENCE_OPEN = /^```\s*([A-Za-z0-9_+#.-]*)?(?:\s+([^\s`]+))?\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const HEADING = /^#{1,4}\s+(.*)$/;
const UL_ITEM = /^\s*[-*•]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Chrome code card. Header shows [path ?? lang] — when a path exists it is
 * rendered in white/70 mono with the language in a dim chip after it;
 * otherwise the bare lang label (old behavior). Clipboard Copy with a
 * 1.5s check feedback.
 */
function CodeBlock({ language, path, code }: { language: string; path?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const helper = document.createElement("textarea");
        helper.value = code;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — fail silently */
    }
  }, [code]);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black/50">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-white/40" />
        {path ? (
          <>
            <span className="min-w-0 truncate font-mono text-[11px] text-white/70">{path}</span>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {language || "code"}
            </span>
          </>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {language || "code"}
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {copied ? <Check size={12} className="text-glint" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono text-white/85">{code}</code>
      </pre>
    </div>
  );
}

/** Renders inline tokens of one text line as React elements. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const token = match[0];
    const key = `${keyPrefix}t${i++}`;
    if (match[1] !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-white/90"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <em key={key} className="italic text-white/90">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white"
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * MarkdownLite renderer. Deterministic line-based block parser: fences,
 * headings, lists, then everything else becomes a paragraph (newlines kept).
 */
export default function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: ReactNode[] = [];
  let key = 0;
  const nextKey = () => `blk-${key++}`;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code (also tolerates an unclosed fence while streaming).
    const fence = FENCE_OPEN.exec(line.trim());
    if (fence) {
      const language = fence[1] ?? "";
      const path = fence[2] ?? undefined;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing fence
      out.push(
        <CodeBlock key={nextKey()} language={language} path={path} code={body.join("\n")} />
      );
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push(
        <h3
          key={nextKey()}
          className="mb-1.5 mt-4 text-base font-medium tracking-tight text-white first:mt-0"
        >
          {renderInline(heading[1], nextKey())}
        </h3>
      );
      i += 1;
      continue;
    }

    if (UL_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = UL_ITEM.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      out.push(
        <ul key={nextKey()} className="my-2.5 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/40" />
              <span className="min-w-0 flex-1">{renderInline(item, `ul${j}-`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (OL_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = OL_ITEM.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      out.push(
        <ol key={nextKey()} className="my-2.5 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2.5">
              <span className="w-4 shrink-0 pt-px text-right font-mono text-[12px] leading-[1.55] text-muted-foreground">
                {j + 1}.
              </span>
              <span className="min-w-0 flex-1">{renderInline(item, `ol${j}-`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: consume until a blank line / fence / heading / list item.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === "" ||
        FENCE_OPEN.test(l.trim()) ||
        HEADING.test(l) ||
        UL_ITEM.test(l) ||
        OL_ITEM.test(l)
      ) {
        break;
      }
      paragraph.push(l);
      i += 1;
    }
    out.push(
      <p key={nextKey()} className="my-2.5 break-words leading-relaxed text-white/85 first:mt-0 last:mb-0">
        {paragraph.map((l, j) => (
          <span key={j}>
            {j > 0 ? <br /> : null}
            {renderInline(l, `p${j}-`)}
          </span>
        ))}
      </p>
    );
  }

  return <div className="min-w-0">{out}</div>;
}
