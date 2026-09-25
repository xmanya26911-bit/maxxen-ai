"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Code2, Copy, Eye, FileCode2, Lock, RefreshCw, Rocket, Save, Shapes, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyText } from "./copy";
import { extFor } from "./blocks";
import type { CodeBlock } from "./types";

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

type PaneTab = "preview" | "code";

export interface WorkspacePaneProps {
  /** Code blocks extracted from the latest successful assistant message. */
  blocks: CodeBlock[];
  /** True while MAXXEN is streaming — drives the hairline + status line. */
  streaming: boolean;
  /** Active conversation id — scopes Save-to-GitHub paths. */
  convId?: string | null;
  /** When set (overlay mode), renders a close button in the header row. */
  onClose?: () => void;
  /** Container classes; overlay mode overrides the docked defaults. */
  className?: string;
}

function WorkspacePaneImpl({ blocks, streaming, onClose, className, convId }: WorkspacePaneProps) {
  const [tab, setTab] = useState<PaneTab>("preview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shipState, setShipState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [shipMsg, setShipMsg] = useState("");
  const previewTabRef = useRef<HTMLButtonElement | null>(null);
  const codeTabRef = useRef<HTMLButtonElement | null>(null);
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

  /** Roving-focus arrow-key navigation for the two tabs. */
  const handleTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: PaneTab = effectiveTab === "preview" ? "code" : "preview";
    const blocked = next === "preview" ? !htmlBlock : blocks.length === 0;
    if (blocked) return;
    setTab(next);
    (next === "preview" ? previewTabRef : codeTabRef).current?.focus();
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
        aria-labelledby={effectiveTab === "preview" ? "ws-tab-preview" : "ws-tab-code"}
        className="flex min-h-0 flex-1 flex-col"
      >
        {blocks.length === 0 ? (
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
            {/* Live viewport — white iframe on the dark chrome frame */}
            <div className="relative min-h-0 flex-1">
              {streaming && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 z-10 h-[2px] animate-pulse bg-white/20"
                />
              )}
              <iframe
                key={refreshKey}
                srcDoc={htmlBlock.code}
                title="Artifact preview"
                sandbox="allow-scripts"
                className="absolute inset-0 h-full w-full bg-white"
              />
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

export default WorkspacePaneImpl;
