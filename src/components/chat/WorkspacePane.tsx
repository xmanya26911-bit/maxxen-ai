"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Brain, Check, Code2, Copy, Eye, FileCode2, Lock, Monitor, MousePointerClick, RefreshCw, Rocket, Save, Shapes, Smartphone, Tablet, X } from "lucide-react";

/**
 * Injected into the preview document when element-pick mode is on. Outlines
 * the hovered element, and on click reports { tag, id, classes, text, path }
 * back to the parent via postMessage. Runs inside the sandboxed iframe, so
 * it can never touch the parent or the network — one-way reporting only.
 */
const PICKER_SCRIPT = `<script>(function(){if(window.__mxPicker)return;window.__mxPicker=true;var n=0,hover=null,selected=null;
function describe(el){var cs=(el.className&&typeof el.className==="string"?el.className:"").split(/\\s+/).filter(Boolean).slice(0,3);var path=[],node=el;while(node&&node!==document.body&&path.length<4){var sib=Array.prototype.indexOf.call(node.parentNode?node.parentNode.children:[],node);path.unshift(node.tagName.toLowerCase()+(sib>0?":nth("+sib+")":""));node=node.parentNode;}return{tag:el.tagName.toLowerCase(),id:el.id||"",classes:cs,text:(el.innerText||"").replace(/\\s+/g," ").slice(0,140),path:path.join(" > "),mxId:el.dataset.mxId||""};}
function paint(el,on,sel){if(!el||!el.style)return;el.style.outline=on?(sel?"2px solid #22c55e":"2px dashed #cbdcff"):"";el.style.outlineOffset=on?"2px":"";}
document.addEventListener("mouseover",function(e){var t=e.target;if(t===hover||t===document.documentElement||t===document.body)return;paint(hover,false,false);hover=t;paint(t,true,false);},true);
document.addEventListener("mouseout",function(){paint(hover,false,false);hover=null;},true);
document.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();var t=e.target;if(!t||!t.tagName)return;if(!t.dataset.mxId){t.dataset.mxId="mx"+(++n);}paint(selected,false,true);selected=t;paint(t,true,true);var info=describe(t);try{parent.postMessage({maxxenSelect:true,selection:info},"*");}catch(_){}},true);
window.addEventListener("message",function(e){var d=e.data||{};if(!d||d.maxxenStyle!==true||!d.id||!d.css)return;var el=document.querySelector('[data-mx-id="'+d.id+'"]');if(!el)return;try{for(var k in d.css){el.style[k]=d.css[k];}}catch(_){}});} )();<\/script>`;

function withPicker(html: string): string {
  if (html.includes("__mxPicker")) return html;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${PICKER_SCRIPT}</body>`);
  return `${html}\n${PICKER_SCRIPT}`;
}

export interface ElementSelection {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  path: string;
  mxId: string;
}

type Viewport = "desktop" | "tablet" | "mobile";
const VIEWPORTS: Record<Viewport, { label: string; width: string }> = {
  desktop: { label: "Desktop", width: "100%" },
  tablet: { label: "Tablet", width: "768px" },
  mobile: { label: "Mobile", width: "390px" },
};
import { cn } from "@/lib/utils";
import { copyText } from "./copy";
import { blockKey, extFor } from "./blocks";
import type { CodeBlock } from "./types";

/** Minimal line diff (LCS) for version comparison. Small files only. */
type DiffRow = { kind: "same" | "add" | "del"; text: string };
function diffLines(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length * b.length > 40000) {
    return [{ kind: "same", text: `…diff skipped (${a.length} vs ${b.length} lines — too large)…` }];
  }
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: "del", text: a[i] });
      i += 1;
    } else {
      rows.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) rows.push({ kind: "del", text: a[i++] });
  while (j < m) rows.push({ kind: "add", text: b[j++] });
  return rows.slice(0, 400);
}
import type { ProjectMemory } from "@/lib/memory";

const LABEL_RULES = "mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-white/40";

/**
 * WorkspacePane — the third pane of the MAXXEN workspace. Docked it renders
 * as a fixed-width right rail (hidden below xl, mounted only when artifacts
 * exist); ChatShell also mounts it as a full-height overlay below xl via the
 * PanelRight header toggle.
 *
 * Two tabs over the latest assistant message's code blocks:
 * - Preview: the newest ```html block rendered live inside a sandboxed iframe
 *   (srcDoc) framed as a browser viewport, with a streaming hairline.
 * - Code: vertical file list (path ?? untitled-N.ext) + active file source
 *   with line numbers.
 * With no blocks: a compact "No artifacts yet" empty state.
 */

type PaneTab = "preview" | "code" | "memory";

export interface BlockVersion {
  /** Identity from blockKey(): explicit path or language bucket. */
  key: string;
  path?: string;
  lang: string;
  code: string;
  /** Human label, e.g. v1, v2 — oldest first. */
  label: string;
}

export interface WorkspacePaneProps {
  /** Code blocks extracted from the latest successful assistant message. */
  blocks: CodeBlock[];
  /** Every version of every file across the thread (oldest first per path). */
  versions?: BlockVersion[];
  /** True while MAXXEN is streaming — drives the hairline + status line. */
  streaming: boolean;
  /** Active conversation id — scopes Save-to-GitHub paths. */
  convId?: string | null;
  /** When set (overlay mode), renders a close button in the header row. */
  onClose?: () => void;
  /** Container classes; overlay mode overrides the docked defaults. */
  className?: string;
}

function WorkspacePaneImpl({ blocks: latestBlocks, versions = [], streaming, onClose, className, convId }: WorkspacePaneProps) {
  // Version pinning: Reject reverts the file to an older version everywhere
  // in this pane (preview, code, copy, save, deploy). Accept clears the pin.
  const [pinned, setPinned] = useState<{ key: string; code: string } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [prevLatest, setPrevLatest] = useState(latestBlocks);
  if (prevLatest !== latestBlocks) {
    setPrevLatest(latestBlocks);
    setPinned(null);
    setShowDiff(false);
  }
  const blocks = pinned
    ? latestBlocks.map((b) => (blockKey(b) === pinned.key ? { ...b, code: pinned.code } : b))
    : latestBlocks;
  const [tab, setTab] = useState<PaneTab>("preview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shipState, setShipState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [shipMsg, setShipMsg] = useState("");
  const previewTabRef = useRef<HTMLButtonElement | null>(null);
  const codeTabRef = useRef<HTMLButtonElement | null>(null);
  const memoryTabRef = useRef<HTMLButtonElement | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  // Reset ship status when a new stream starts (render-phase adjustment).
  const [prevStreaming, setPrevStreaming] = useState(streaming);
  if (prevStreaming !== streaming) {
    setPrevStreaming(streaming);
    if (streaming) {
      setShipState("idle");
      setShipMsg("");
    }
  }

  // ---- Visual builder: element picker, viewports, live style ----
  const [pickerOn, setPickerOn] = useState(false);
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [styleMargin, setStyleMargin] = useState(0);
  const [stylePadding, setStylePadding] = useState(0);
  const [styleFont, setStyleFont] = useState(16);
  const [styleRadius, setStyleRadius] = useState(0);
  const [styleCopied, setStyleCopied] = useState(false);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const selectionRef = useRef<ElementSelection | null>(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Incoming element reports from the sandboxed preview iframe.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const frame = previewFrameRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const d = e.data as { maxxenSelect?: boolean; selection?: ElementSelection } | null;
      if (!d || d.maxxenSelect !== true || !d.selection || typeof d.selection !== "object") return;
      const s = d.selection;
      if (typeof s.tag !== "string" || typeof s.mxId !== "string" || !s.mxId) return;
      setSelection({
        tag: s.tag,
        id: typeof s.id === "string" ? s.id : "",
        classes: Array.isArray(s.classes) ? s.classes.filter((c): c is string => typeof c === "string").slice(0, 5) : [],
        text: typeof s.text === "string" ? s.text.slice(0, 140) : "",
        path: typeof s.path === "string" ? s.path : "",
        mxId: s.mxId,
      });
      setStyleMargin(0);
      setStylePadding(0);
      setStyleFont(16);
      setStyleRadius(0);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const postStyle = (next: { margin: number; padding: number; fontSize: number; radius: number }) => {
    const sel = selectionRef.current;
    const frame = previewFrameRef.current;
    if (!sel || !frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      {
        maxxenStyle: true,
        id: sel.mxId,
        css: {
          margin: `${next.margin}px`,
          padding: `${next.padding}px`,
          fontSize: `${next.fontSize}px`,
          borderRadius: `${next.radius}px`,
        },
      },
      "*"
    );
  };

  const setStyle = (patch: Partial<{ margin: number; padding: number; fontSize: number; radius: number }>) => {
    const next = {
      margin: patch.margin ?? styleMargin,
      padding: patch.padding ?? stylePadding,
      fontSize: patch.fontSize ?? styleFont,
      radius: patch.radius ?? styleRadius,
    };
    setStyleMargin(next.margin);
    setStylePadding(next.padding);
    setStyleFont(next.fontSize);
    setStyleRadius(next.radius);
    postStyle(next);
  };

  const styleCssText = () => {
    const sel = selection;
    if (!sel) return "";
    const target = sel.id ? `#${sel.id}` : sel.classes[0] ? `.${sel.classes[0]}` : sel.tag;
    return `${target} {\n  margin: ${styleMargin}px;\n  padding: ${stylePadding}px;\n  font-size: ${styleFont}px;\n  border-radius: ${styleRadius}px;\n}`;
  };

  const copyStyle = async () => {
    if (await copyText(styleCssText())) {
      setStyleCopied(true);
      window.setTimeout(() => setStyleCopied(false), 1500);
    }
  };

  /** Ask the chat to explain / rewrite the selected element (via ChatShell). */
  const sendToChat = (kind: "explain" | "rewrite") => {
    const sel = selection;
    if (!sel) return;
    const context = `Selected element from my preview:\n<${sel.tag}${sel.id ? ` id="${sel.id}"` : ""}${sel.classes.length ? ` class="${sel.classes.join(" ")}"` : ""}>${sel.text}</${sel.tag}>\nPath: ${sel.path}\nLive overrides:\n${styleCssText()}`;
    const text =
      kind === "explain"
        ? `${context}\n\nExplain this element: what is it, how is it styled, and how does it fit the page?`
        : `${context}\n\nRewrite this component: keep the same purpose, improve styling and structure, and output the full replacement code. Respect my project memory (framework, design, rules).`;
    window.dispatchEvent(new CustomEvent<string>("maxxen:send-prompt", { detail: text }));
  };

  const blockPath = (b: CodeBlock, idx: number) =>
    `builds/${convId || "chat"}/${b.path || `file-${idx + 1}.${extFor(b.lang)}`}`;

  /** Save every block to YOUR GitHub (maxxen-data, via /api/github/save). */
  const saveAll = async () => {
    const token = window.localStorage.getItem("maxxen_github_token") || "";
    if (!token) {
      setShipState("error");
      setShipMsg("Add YOUR GitHub token in Settings → Integrations first.");
      return;
    }
    if (!blocks.length || streaming) return;
    setShipState("working");
    setShipMsg(`Saving ${blocks.length} file${blocks.length === 1 ? "" : "s"} to YOUR repo…`);
    let done = 0;
    let lastErr = "";
    for (let idx = 0; idx < blocks.length; idx++) {
      try {
        const r = await fetch("/api/github/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            githubToken: token,
            path: blockPath(blocks[idx], idx),
            content: blocks[idx].code,
            message: "maxxen: save build from /chat",
          }),
        });
        const j = await r.json().catch(() => null);
        if (j?.ok) done += 1;
        else lastErr = (j && j.error) || "Save failed";
      } catch (e) {
        lastErr = e instanceof Error ? e.message : "Save failed";
      }
    }
    if (!aliveRef.current) return;
    if (done === blocks.length) {
      setShipState("done");
      setShipMsg(`Saved ${done} file${done === 1 ? "" : "s"} to YOUR repo under builds/${convId || "chat"}/.`);
    } else {
      setShipState("error");
      setShipMsg(`Saved ${done}/${blocks.length}. ${lastErr}`);
    }
  };

  /** Deploy the newest HTML block to YOUR Vercel project. */
  const deployLatest = async () => {
    const html = [...blocks].reverse().find((b) => b.lang === "html")?.code;
    const token = window.localStorage.getItem("maxxen_vercel_token") || "";
    const project = window.localStorage.getItem("maxxen_vercel_project") || "maxxen";
    if (!html) {
      setShipState("error");
      setShipMsg("No HTML artifact in this thread yet — ask for one in Build mode.");
      return;
    }
    if (!token) {
      setShipState("error");
      setShipMsg("Add YOUR Vercel token in Settings → Integrations first.");
      return;
    }
    if (streaming) return;
    setShipState("working");
    setShipMsg("Deploying to YOUR Vercel project…");
    try {
      const r = await fetch("/api/vercel/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vercelToken: token,
          projectName: project,
          files: [{ file: "index.html", data: html }],
        }),
      });
      const j = await r.json().catch(() => null);
      if (!j?.ok || !j?.id) {
        throw new Error((j && j.error) || "Deploy failed to start.");
      }
      for (let i = 0; i < 36; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        if (!aliveRef.current) return;
        try {
          const s = await fetch("/api/vercel/status", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ vercelToken: token, deploymentId: j.id }),
          });
          const st = await s.json().catch(() => null);
          if (st?.error) throw new Error(st.error);
          if (st?.state === "READY") {
            if (!aliveRef.current) return;
            setShipState("done");
            setShipMsg(`Live ✓ https://${st.url || j.url}`);
            return;
          }
          if (st && ["ERROR", "CANCELED"].includes(st.state)) {
            throw new Error(`Deploy ${String(st.state).toLowerCase()} — check your Vercel dashboard for logs.`);
          }
          if (aliveRef.current) setShipMsg(`Deploying… ${st?.state || "working"} (${i + 1})`);
        } catch {
          /* transient — keep polling */
        }
      }
      if (!aliveRef.current) return;
      setShipState("done");
      setShipMsg(`Still working — track ${j.id} in your Vercel dashboard.`);
    } catch (e) {
      if (!aliveRef.current) return;
      setShipState("error");
      setShipMsg(e instanceof Error ? e.message : "Deploy failed.");
    }
  };

  /** Newest ```html block — the live preview source. */
  const htmlBlock = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].lang === "html") return blocks[i];
    }
    return null;
  }, [blocks]);

  /** Clamp the file cursor when the conversation/blocks change under us. */
  const safeIndex = activeFile >= 0 && activeFile < blocks.length ? activeFile : 0;
  const activeBlock = blocks.length > 0 ? blocks[safeIndex] : null;

  // Preview needs an html block; fall back to the Code view when it doesn't.
  const effectiveTab: PaneTab = tab === "preview" && !htmlBlock ? "code" : tab;
  const showPreview = effectiveTab === "preview" && htmlBlock !== null;

  const activeLineCount = useMemo(
    () => (activeBlock ? activeBlock.code.split("\n").length : 0),
    [activeBlock]
  );

  const handleCopy = async () => {
    if (!activeBlock) return;
    if (await copyText(activeBlock.code)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const reloadPreview = () => setRefreshKey((k) => k + 1);

  /** Roving-focus arrow-key navigation for the tabs. */
  const handleTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const order: PaneTab[] = ["preview", "code", "memory"];
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = order[(order.indexOf(effectiveTab) + dir + order.length) % order.length];
    const blocked = next === "preview" ? !htmlBlock : next === "code" && blocks.length === 0;
    if (blocked) return;
    setTab(next);
    (next === "preview" ? previewTabRef : next === "code" ? codeTabRef : memoryTabRef).current?.focus();
  };

  const tabClasses = (selected: boolean, disabled: boolean) =>
    cn(
      "mx-focus flex items-center gap-1.5 border-b-2 px-2.5 font-mono text-xs transition-colors",
      selected ? "border-white text-white" : "border-transparent text-muted-foreground hover:text-white",
      disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
    );

  return (
    <aside
      className={cn(
        "hidden w-[380px] shrink-0 flex-col border-l border-white/[0.06] bg-black/30 2xl:w-[440px] xl:flex",
        className
      )}
    >
      {/* Header — tabs + status / copy / count / close */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
        <div
          role="tablist"
          aria-label="Workspace view"
          onKeyDown={handleTablistKeyDown}
          className="flex h-full items-stretch"
        >
          <button
            ref={previewTabRef}
            id="ws-tab-preview"
            role="tab"
            type="button"
            aria-selected={effectiveTab === "preview"}
            aria-controls="ws-panel"
            tabIndex={effectiveTab === "preview" ? 0 : -1}
            disabled={!htmlBlock}
            onClick={() => setTab("preview")}
            className={tabClasses(effectiveTab === "preview", !htmlBlock)}
          >
            <Eye size={13} aria-hidden="true" />
            Preview
          </button>
          <button
            ref={codeTabRef}
            id="ws-tab-code"
            role="tab"
            type="button"
            aria-selected={effectiveTab === "code"}
            aria-controls="ws-panel"
            tabIndex={effectiveTab === "code" ? 0 : -1}
            disabled={blocks.length === 0}
            onClick={() => setTab("code")}
            className={tabClasses(effectiveTab === "code", blocks.length === 0)}
          >
            <Code2 size={13} aria-hidden="true" />
            Code
          </button>
          <button
            ref={memoryTabRef}
            id="ws-tab-memory"
            role="tab"
            type="button"
            aria-selected={effectiveTab === "memory"}
            aria-controls="ws-panel"
            tabIndex={effectiveTab === "memory" ? 0 : -1}
            onClick={() => setTab("memory")}
            className={tabClasses(effectiveTab === "memory", false)}
            title="Per-project memory the agent never forgets"
          >
            <Brain size={13} aria-hidden="true" />
            Memory
          </button>
        </div>

        {/* Subtle artifact status */}
        {blocks.length > 0 && (
          <span
            className="hidden items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 sm:flex"
            role="status"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                streaming ? "bg-glint animate-glint" : "bg-white/30"
              )}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
              {streaming ? "Live" : "Ready"}
            </span>
          </span>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {effectiveTab === "code" && activeBlock && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy active file to clipboard"
              className="mx-focus mx-press inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {copied ? <Check size={12} className="text-glint" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          {blocks.length > 0 && (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {blocks.length} {blocks.length === 1 ? "file" : "files"}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close workspace"
              className="mx-focus mx-press shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Tab body */}
      <div
        id="ws-panel"
        role="tabpanel"
        aria-labelledby={effectiveTab === "preview" ? "ws-tab-preview" : effectiveTab === "code" ? "ws-tab-code" : "ws-tab-memory"}
        className="flex min-h-0 flex-1 flex-col"
      >
        {effectiveTab === "memory" ? (
          <MemoryForm key={convId ?? "none"} convId={convId} />
        ) : blocks.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center">
            <Shapes size={24} className="text-white/25" aria-hidden="true" />
            <p className="mt-2 text-[13px] text-white/70">No artifacts yet</p>
            <p className="max-w-[26ch] text-xs leading-relaxed text-white/45">
              Ask in Build mode — files render here live.
            </p>
            <code className="mx-kbd mt-3">{"```html index.html"}</code>
          </div>
        ) : showPreview && htmlBlock ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Browser chrome toolbar */}
            <div className="relative flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white/20" />
                <span className="h-2 w-2 rounded-full bg-white/20" />
                <span className="h-2 w-2 rounded-full bg-white/20" />
              </span>
              <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                <Lock size={10} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 truncate font-mono text-xs text-white/70">
                  maxxen.preview/artifact
                </span>
              </span>
              {streaming && (
                <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="bg-glint animate-glint h-1.5 w-1.5 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 truncate">MAXXEN is writing your artifact…</span>
                </span>
              )}
              <button
                type="button"
                onClick={reloadPreview}
                aria-label="Reload preview"
                title="Reload preview"
                className="mx-focus mx-press ml-auto shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <RefreshCw size={13} aria-hidden="true" />
              </button>
            </div>
            {/* Builder toolbar — element picker + responsive viewports */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-3 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setPickerOn((v) => !v);
                  setSelection(null);
                }}
                aria-pressed={pickerOn}
                title="Click any element in the preview to select it"
                className={cn(
                  "mx-focus mx-press inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[11px] transition-colors",
                  pickerOn ? "bg-white text-black" : "text-muted-foreground hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <MousePointerClick size={12} aria-hidden="true" />
                {pickerOn ? "Picking…" : "Pick"}
              </button>
              <div role="group" aria-label="Preview viewport" className="flex items-center gap-0.5 rounded-md border border-white/[0.07] p-0.5">
                {(
                  [
                    ["desktop", Monitor, "Desktop"],
                    ["tablet", Tablet, "Tablet 768"],
                    ["mobile", Smartphone, "Mobile 390"],
                  ] as const
                ).map(([id, IconCmp, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewport(id)}
                    aria-pressed={viewport === id}
                    title={label}
                    aria-label={`Preview as ${label}`}
                    className={cn(
                      "mx-focus rounded-[5px] p-1.5 transition-colors",
                      viewport === id ? "bg-white/[0.1] text-white" : "text-muted-foreground hover:text-white"
                    )}
                  >
                    <IconCmp size={13} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {selection && (
                <span className="ml-auto max-w-[45%] truncate font-mono text-[10.5px] text-emerald-100/80" title={selection.path}>
                  &lt;{selection.tag}{selection.id ? `#${selection.id}` : ""}
                  {selection.classes.slice(0, 2).map((c) => `.${c}`).join("")}&gt;
                </span>
              )}
            </div>
            {/* Inspect panel — what was selected + live style controls */}
            {selection && (
              <div className="shrink-0 space-y-2.5 border-b border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                <div className="font-mono text-[10.5px] leading-relaxed text-white/55">
                  <div><span className="text-white/30">tag </span>{selection.tag}</div>
                  {selection.id && (<div><span className="text-white/30">id </span>#{selection.id}</div>)}
                  {selection.classes.length > 0 && (<div><span className="text-white/30">class </span>.{selection.classes.join(" .")}</div>)}
                  {selection.text && (<div className="truncate"><span className="text-white/30">text </span>“{selection.text}”</div>)}
                  {selection.path && (<div className="truncate"><span className="text-white/30">path </span>{selection.path}</div>)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <label className="flex items-center gap-2 font-mono text-[10px] text-white/45">
                    <span className="w-12 shrink-0 uppercase tracking-wider">Margin</span>
                    <input type="range" min={0} max={64} value={styleMargin} onChange={(e) => setStyle({ margin: Number(e.target.value) })} aria-label="Margin in pixels" className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white" />
                    <span className="w-9 shrink-0 text-right tabular-nums">{styleMargin}px</span>
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[10px] text-white/45">
                    <span className="w-12 shrink-0 uppercase tracking-wider">Padding</span>
                    <input type="range" min={0} max={64} value={stylePadding} onChange={(e) => setStyle({ padding: Number(e.target.value) })} aria-label="Padding in pixels" className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white" />
                    <span className="w-9 shrink-0 text-right tabular-nums">{stylePadding}px</span>
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[10px] text-white/45">
                    <span className="w-12 shrink-0 uppercase tracking-wider">Font</span>
                    <input type="range" min={10} max={40} value={styleFont} onChange={(e) => setStyle({ fontSize: Number(e.target.value) })} aria-label="Font size in pixels" className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white" />
                    <span className="w-9 shrink-0 text-right tabular-nums">{styleFont}px</span>
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[10px] text-white/45">
                    <span className="w-12 shrink-0 uppercase tracking-wider">Radius</span>
                    <input type="range" min={0} max={32} value={styleRadius} onChange={(e) => setStyle({ radius: Number(e.target.value) })} aria-label="Corner radius in pixels" className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white" />
                    <span className="w-9 shrink-0 text-right tabular-nums">{styleRadius}px</span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => sendToChat("explain")}
                    className="mx-focus mx-press inline-flex min-h-[28px] items-center rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-white/[0.08]"
                  >
                    Explain this element
                  </button>
                  <button
                    type="button"
                    onClick={() => sendToChat("rewrite")}
                    className="mx-focus mx-press inline-flex min-h-[28px] items-center rounded-md bg-white px-2.5 text-[11px] font-semibold text-black transition-colors hover:bg-white/90"
                  >
                    Rewrite this component
                  </button>
                  <button
                    type="button"
                    onClick={copyStyle}
                    className="mx-focus mx-press inline-flex min-h-[28px] items-center rounded-md px-2 font-mono text-[11px] text-muted-foreground transition-colors hover:text-white"
                  >
                    {styleCopied ? "Copied ✓" : "Copy CSS"}
                  </button>
                </div>
              </div>
            )}
            {/* Live viewport — white iframe on the dark chrome frame */}
            <div className="relative min-h-0 flex-1 overflow-auto bg-black/40">
              {streaming && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 z-10 h-[2px] animate-pulse bg-white/20"
                />
              )}
              <div className="mx-auto h-full min-h-full" style={{ width: VIEWPORTS[viewport].width, maxWidth: "100%" }}>
                <iframe
                  key={`${refreshKey}-${pickerOn}-${viewport}`}
                  ref={previewFrameRef}
                  srcDoc={pickerOn ? withPicker(htmlBlock.code) : htmlBlock.code}
                  title={`Artifact preview (${VIEWPORTS[viewport].label})`}
                  sandbox="allow-scripts"
                  className="block h-full min-h-[320px] w-full border-x border-white/[0.07] bg-white"
                />
              </div>
            </div>
          </div>
        ) : (
          activeBlock && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Vertical file list */}
              <div className="shrink-0 space-y-0.5 border-b border-white/[0.06] p-1.5">
                {blocks.map((b, i) => {
                  const active = i === safeIndex;
                  return (
                    <button
                      key={`${i}-${b.path ?? b.lang}`}
                      type="button"
                      onClick={() => setActiveFile(i)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "mx-focus flex min-h-[32px] w-full items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-left font-mono text-xs transition-colors",
                        active
                          ? "border-white/60 bg-white/[0.06] text-white"
                          : "border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-white"
                      )}
                    >
                      <FileCode2
                        size={12}
                        aria-hidden="true"
                        className={cn("shrink-0", active ? "text-white/70" : "text-white/35")}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {b.path ?? `untitled-${i + 1}.${extFor(b.lang)}`}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase text-white/30">
                        {b.lang || "txt"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Version history — every generation of the active file in this thread */}
              <VersionBar
                versions={versions}
                activeKey={activeBlock ? blockKey(activeBlock) : null}
                pinned={pinned}
                showDiff={showDiff}
                onToggleDiff={() => setShowDiff((v) => !v)}
                onAccept={() => {
                  setPinned(null);
                  setShowDiff(false);
                }}
                onReject={(code) => {
                  if (!activeBlock) return;
                  setPinned({ key: blockKey(activeBlock), code });
                }}
              />
              {/* Active file source — line-number gutter + code */}
              <div className="mx-scroll-thin min-h-0 flex-1 overflow-auto bg-black/50 p-4">
                <div className="flex gap-3">
                  <div aria-hidden="true" className="select-none text-right font-mono text-[13px] leading-relaxed text-white/20">
                    {Array.from({ length: activeLineCount }, (_, i) => (
                      <span key={i} className="block">
                        {i + 1}
                      </span>
                    ))}
                  </div>
                  <pre className="min-w-0 flex-1 whitespace-pre text-[13px] leading-relaxed">
                    <code className="font-mono text-white/85">{activeBlock.code}</code>
                  </pre>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Ship bar — Save to YOUR GitHub / Deploy to YOUR Vercel */}
      {blocks.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveAll}
              disabled={streaming || shipState === "working"}
              className="mx-focus mx-press inline-flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40"
            >
              <Save size={13} aria-hidden="true" />
              Save to GitHub
            </button>
            <button
              type="button"
              onClick={deployLatest}
              disabled={streaming || shipState === "working" || !blocks.some((b) => b.lang === "html")}
              title={!blocks.some((b) => b.lang === "html") ? "Needs an HTML artifact first" : "Deploy to your Vercel project"}
              className="mx-focus mx-press inline-flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition-all hover:bg-white/90 disabled:opacity-40"
            >
              <Rocket size={13} aria-hidden="true" />
              Deploy
            </button>
          </div>
          {shipMsg && (
            <p
              role="status"
              className={
                shipState === "error"
                  ? "pt-1.5 text-[11px] leading-snug text-red-200/80"
                  : "truncate pt-1.5 font-mono text-[10.5px] text-white/45"
              }
              title={shipMsg}
            >
              {shipState === "working" ? "◌ " : shipState === "done" ? "✓ " : shipState === "error" ? "✗ " : ""}
              {shipMsg}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

/**
 * Per-project memory editor. Persists to the local mirror instantly and to
 * the user's maxxen-data repo (memory/<conv>.json) on Save. The agent loop
 * injects the saved memory into every run, so decisions survive sessions.
 */
function MemoryForm({ convId }: { convId?: string | null }) {
  const [form, setForm] = useState(() => {
    try {
      const raw = convId ? window.localStorage.getItem(`maxxen_memory_${convId}`) : null;
      if (raw) {
        const p = JSON.parse(raw) as Partial<ProjectMemory>;
        return {
          framework: typeof p.framework === "string" ? p.framework : "",
          language: typeof p.language === "string" ? p.language : "",
          ui: typeof p.ui === "string" ? p.ui : "",
          database: typeof p.database === "string" ? p.database : "",
          design: Array.isArray(p.design) ? p.design.filter((d): d is string => typeof d === "string").join("\n") : "",
          rules: Array.isArray(p.rules) ? p.rules.filter((r): r is string => typeof r === "string").join("\n") : "",
        };
      }
    } catch {
      /* fall through to blanks */
    }
    return { framework: "", language: "", ui: "", database: "", design: "", rules: "" };
  });
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  // Best-effort: adopt the server copy when it has entries this form lacks.
  useEffect(() => {
    if (!convId) return;
    const token = window.localStorage.getItem("maxxen_github_token") || "";
    if (!token) return;
    (async () => {
      try {
        const r = await fetch("/api/memory/load", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ githubToken: token, project: convId }),
        });
        const j = await r.json().catch(() => null);
        const m = j?.memory as Partial<ProjectMemory> | undefined;
        if (r.ok && m && (m.framework || m.language || m.ui || m.database || m.design?.length || m.rules?.length)) {
          setForm((prev) => ({
            framework: prev.framework || (typeof m.framework === "string" ? m.framework : ""),
            language: prev.language || (typeof m.language === "string" ? m.language : ""),
            ui: prev.ui || (typeof m.ui === "string" ? m.ui : ""),
            database: prev.database || (typeof m.database === "string" ? m.database : ""),
            design: prev.design || (Array.isArray(m.design) ? m.design.filter((d) => typeof d === "string").join("\n") : ""),
            rules: prev.rules || (Array.isArray(m.rules) ? m.rules.filter((x) => typeof x === "string").join("\n") : ""),
          }));
        }
      } catch {
        /* offline — local mirror stands */
      }
    })();
  }, [convId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    if (!convId) {
      setState("error");
      setMsg("Open a conversation first — memory belongs to a project.");
      return;
    }
    const memory: ProjectMemory = {
      framework: form.framework.trim().slice(0, 120),
      language: form.language.trim().slice(0, 120),
      ui: form.ui.trim().slice(0, 120),
      database: form.database.trim().slice(0, 120),
      design: form.design.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30),
      rules: form.rules.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30),
    };
    try {
      window.localStorage.setItem(`maxxen_memory_${convId}`, JSON.stringify(memory));
    } catch {
      /* ignore */
    }
    const token = window.localStorage.getItem("maxxen_github_token") || "";
    if (!token) {
      setState("done");
      setMsg("Saved in this browser. Add YOUR GitHub token in Settings to persist it across sessions.");
      return;
    }
    setState("working");
    setMsg("Saving to YOUR repo…");
    try {
      const r = await fetch("/api/memory/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ githubToken: token, project: convId, memory }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error((j && j.error) || "Save failed.");
      setState("done");
      setMsg("Memory saved — the agent carries it into every run of this project.");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const field =
    "mx-focus w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30";
  const label = "mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-white/40";

  return (
    <div className="mx-scroll-thin min-h-0 flex-1 overflow-auto p-3">
      <p className="text-[11.5px] leading-relaxed text-white/50">
        Facts Maxxen must not forget about this project. Saved per conversation, injected into every agent run.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            ["framework", "Framework", "Next.js"],
            ["language", "Language", "TypeScript"],
            ["ui", "UI", "Tailwind"],
            ["database", "Database", "PostgreSQL"],
          ] as const
        ).map(([k, labelText, ph]) => (
          <div key={k}>
            <label htmlFor={`mem-${k}`} className={label}>{labelText}</label>
            <input id={`mem-${k}`} className={field} value={form[k]} onChange={set(k)} placeholder={ph} autoComplete="off" />
          </div>
        ))}
      </div>
      <div className="mt-2.5">
        <label htmlFor="mem-design" className={label}>Design — one per line</label>
        <textarea
          id="mem-design"
          className={field}
          rows={4}
          value={form.design}
          onChange={set("design")}
          placeholder={"Dark\nMinimal\nPremium\nRounded cards"}
        />
      </div>
      <div className="mt-2.5">
        <label htmlFor="mem-rules" className={LABEL_RULES}>Rules — one per line</label>
        <textarea
          id="mem-rules"
          className={field}
          rows={4}
          value={form.rules}
          onChange={set("rules")}
          placeholder={"Don't use gradients\nUse server components where possible\nKeep components reusable"}
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={state === "working"}
        className="mx-focus mx-press mt-3 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-white px-3.5 text-xs font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-40"
      >
        <Save size={13} aria-hidden="true" />
        {state === "working" ? "Saving…" : "Save memory"}
      </button>
      {msg && (
        <p role="status" className={state === "error" ? "pt-2 text-[11px] text-red-200/80" : "pt-2 font-mono text-[10.5px] text-white/45"}>
          {state === "done" ? "✓ " : state === "error" ? "✗ " : ""}
          {msg}
        </p>
      )}
    </div>
  );
}

/**
 * Version history for one file: every generation across the thread, a
 * line-diff against the latest, and Accept (keep latest) / Reject (revert
 * the file to the selected older version everywhere in this pane —
 * preview, copy, save, deploy) controls. AI never silently rewrites at
 * scale: each regeneration is inspectable here.
 */
function VersionBar({
  versions,
  activeKey,
  pinned,
  showDiff,
  onToggleDiff,
  onAccept,
  onReject,
}: {
  versions: BlockVersion[];
  activeKey: string | null;
  pinned: { key: string; code: string } | null;
  showDiff: boolean;
  onToggleDiff: () => void;
  onAccept: () => void;
  onReject: (code: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!activeKey) return null;
  const mine = versions.filter((v) => v.key === activeKey);
  if (mine.length < 2) return null;
  const latest = mine[mine.length - 1];
  const current = selected ? mine.find((v) => v.label === selected) ?? latest : latest;
  const isPinnedView = pinned?.key === activeKey;
  const rows = showDiff && current.code !== latest.code ? diffLines(current.code, latest.code) : null;
  return (
    <div className="shrink-0 space-y-2 border-b border-white/[0.06] bg-white/[0.015] p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">Versions</span>
        {mine.map((v) => (
          <button
            key={v.label}
            type="button"
            onClick={() => setSelected(v.label === latest.label ? null : v.label)}
            aria-pressed={(selected ?? latest.label) === v.label}
            title={`${v.label} of ${v.path ?? v.lang}`}
            className={cn(
              "mx-focus rounded-md border px-2 py-1 font-mono text-[10.5px] transition-colors",
              (selected ?? latest.label) === v.label
                ? "border-white/40 bg-white/[0.08] text-white"
                : "border-white/10 text-muted-foreground hover:text-white"
            )}
          >
            {v.label}
            {isPinnedView && v.code === pinned.code ? " ●" : ""}
          </button>
        ))}
        <span className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onToggleDiff}
            disabled={current.code === latest.code}
            aria-expanded={showDiff}
            className="mx-focus rounded-md border border-white/10 px-2 py-1 font-mono text-[10.5px] text-muted-foreground transition-colors hover:text-white disabled:opacity-40"
          >
            {showDiff ? "Hide diff" : "Diff"}
          </button>
          {isPinnedView ? (
            <button
              type="button"
              onClick={onAccept}
              className="mx-focus rounded-md bg-white px-2 py-1 font-mono text-[10.5px] font-semibold text-black transition-colors hover:bg-white/90"
            >
              Accept latest
            </button>
          ) : (
            current.code !== latest.code && (
              <button
                type="button"
                onClick={() => onReject(current.code)}
                className="mx-focus rounded-md border border-amber-200/30 bg-amber-100/[0.06] px-2 py-1 font-mono text-[10.5px] font-medium text-amber-100 transition-colors hover:bg-amber-100/[0.1]"
              >
                Revert to {current.label}
              </button>
            )
          )}
        </span>
      </div>
      {pinned?.key === activeKey && (
        <p className="font-mono text-[10.5px] text-amber-100/80" role="status">
          Reverted — preview, copy, save and deploy now use this version. Accept latest to undo.
        </p>
      )}
      {rows && (
        <pre
          aria-label={`Diff ${current.label} against latest`}
          className="mx-scroll-thin max-h-56 overflow-auto rounded-md border border-white/[0.07] bg-black/50 p-2.5 font-mono text-[11px] leading-relaxed"
        >
          {rows.map((r, i) => (
            <div
              key={`${i}-${r.kind}-${r.text.slice(0, 16)}`}
              className={
                r.kind === "add"
                  ? "bg-emerald-300/[0.08] text-emerald-100/90"
                  : r.kind === "del"
                    ? "bg-red-300/[0.08] text-red-100/90"
                    : "text-white/35"
              }
            >
              <span aria-hidden="true" className="mr-2 select-none opacity-60">
                {r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}
              </span>
              {r.text || " "}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

export default WorkspacePaneImpl;
