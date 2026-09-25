"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  BadgeCheck,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  FileCode2,
  LayoutGrid,
  Lock,
  Paperclip,
  RotateCw,
  Shield,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_ICONS,
  AGENT_ACTIVITY,
  AGENT_CHIP_ICON,
  CONVERSATION,
  FILE_ICON,
  SIDEBAR_ITEMS,
} from "@/lib/constants";
import { LogoMark } from "./logo";

/* ------------------------------------------------------------------ */
/* Local types & data                                                  */
/* ------------------------------------------------------------------ */

/** The one focus ring, shared with the /chat workspace. */
const FOCUS_RING = "mx-focus";

const HEADER_TABS = ["Agent", "Code", "Preview"] as const;
type WorkspaceTab = (typeof HEADER_TABS)[number];

const MODES = ["Plan", "Build", "Review"] as const;
type Mode = (typeof MODES)[number];

type ActivityStatus = (typeof AGENT_ACTIVITY)[number]["status"];

const ACTIVITY_STYLES: Record<ActivityStatus, { icon: string; label: string }> = {
  done: { icon: "text-white/70", label: "text-white/85" },
  running: { icon: "animate-spin text-white", label: "text-white" },
  pending: { icon: "text-white/20", label: "text-white/35" },
};

/** Quiet count badges for two sidebar items — real product metadata, not filler. */
const SIDEBAR_COUNTS: Partial<Record<(typeof SIDEBAR_ITEMS)[number]["label"], string>> = {
  Projects: "6",
  Agents: "3",
};

const MINI_FEATURES = [
  { icon: Zap, title: "Deploys", line: "Instant deploys on every commit." },
  { icon: LayoutGrid, title: "Collaboration", line: "Realtime collaboration built in." },
  { icon: Shield, title: "Security", line: "Enterprise-grade security." },
] as const;

const CODE_FILES = [
  "app/layout.tsx",
  "app/page.tsx",
  "components/hero.tsx",
  "components/pricing.tsx",
  "tailwind.config.ts",
] as const;

type CodeSegment = { t: string; c: string };

/** Hand-colored monochrome snippet — no syntax highlighting library. */
const HERO_CODE: readonly (readonly CodeSegment[])[] = [
  [
    { t: "export function ", c: "text-white/90" },
    { t: "Hero", c: "text-white/85" },
    { t: "() {", c: "text-white/40" },
  ],
  [
    { t: "  const ", c: "text-white/90" },
    { t: "{ scrollYProgress }", c: "text-white/70" },
    { t: " = ", c: "text-white/40" },
    { t: "useScroll", c: "text-white/85" },
    { t: "();", c: "text-white/40" },
  ],
  [{ t: "  // cinematic entrance", c: "text-white/30 italic" }],
  [
    { t: "  return ", c: "text-white/90" },
    { t: "(", c: "text-white/40" },
  ],
  [
    { t: "    <section", c: "text-white/85" },
    { t: " className=", c: "text-white/40" },
    { t: '"min-h-screen"', c: "text-white/55 italic" },
    { t: ">", c: "text-white/40" },
  ],
  [{ t: "      <motion.h1", c: "text-white/85" }],
  [
    { t: "        initial=", c: "text-white/40" },
    { t: "{{ opacity: 0, y: 20 }}", c: "text-white/70" },
  ],
  [
    { t: "        animate=", c: "text-white/40" },
    { t: "{{ opacity: 1, y: 0 }}", c: "text-white/70" },
  ],
  [
    { t: "        className=", c: "text-white/40" },
    { t: '"text-8xl tracking-[-3px]"', c: "text-white/55 italic" },
  ],
  [{ t: "      >", c: "text-white/40" }],
  [{ t: "        Build anything.", c: "text-white/85" }],
  [{ t: "      </motion.h1>", c: "text-white/85" }],
  [{ t: "    </section>", c: "text-white/85" }],
  [{ t: "  );", c: "text-white/40" }],
  [{ t: "}", c: "text-white/40" }],
];

/* ------------------------------------------------------------------ */
/* WorkspaceHeader — top bar of the frame                              */
/* ------------------------------------------------------------------ */

function WorkspaceHeader({
  tab,
  onTabChange,
}: {
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}) {
  /** Arrow-key navigation across the segmented tabs. */
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = HEADER_TABS.indexOf(tab);
    const next = HEADER_TABS[(idx + (e.key === "ArrowRight" ? 1 : HEADER_TABS.length - 1)) % HEADER_TABS.length];
    onTabChange(next);
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-3 md:px-4">
      {/* Left: brand + breadcrumb */}
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoMark className="h-5 w-5" />
        <span className="text-[13px] font-semibold tracking-tight text-white">
          MAXXEN
        </span>
        <span aria-hidden="true" className="hidden h-4 w-px bg-white/10 sm:block" />
        <span className="hidden min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground sm:flex">
          <span className="truncate">production</span>
          <ChevronRight className="h-3 w-3 shrink-0 text-white/25" aria-hidden="true" />
          <span className="truncate">saas-landing</span>
        </span>
      </div>

      {/* Center: segmented view tabs */}
      <div
        className="hidden items-center rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5 md:flex"
        role="tablist"
        aria-label="Workspace views"
        onKeyDown={handleKeyDown}
      >
        {HEADER_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTabChange(t)}
            tabIndex={tab === t ? 0 : -1}
            className={cn(
              "rounded-[6px] px-2.5 py-1 text-xs transition-colors",
              tab === t
                ? "bg-white/[0.08] text-white"
                : "text-muted-foreground hover:text-white",
              FOCUS_RING
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Right: status + deploy */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 sm:flex">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          <span className="font-mono text-[10px] text-muted-foreground">MAXXEN-1</span>
          <span aria-hidden="true" className="text-white/20">·</span>
          <span className="font-mono text-[10px] text-white/40">online</span>
        </span>
        <button
          type="button"
          className={cn(
            "mx-press rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-opacity hover:opacity-80",
            FOCUS_RING
          )}
        >
          Deploy
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* WorkspaceSidebar — left column                                      */
/* ------------------------------------------------------------------ */

function WorkspaceSidebar() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <aside className="hidden min-w-0 flex-col border-r border-white/[0.06] bg-[#070707] md:flex">
      {/* Workspace switcher */}
      <div className="p-2.5">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white/[0.03]",
            FOCUS_RING
          )}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.08] text-[10px] font-bold text-white">
            M
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
            Alex&apos;s Workspace
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      {/* Nav */}
      <p className="px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
        Workspace
      </p>
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Workspace navigation">
        {SIDEBAR_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeIndex === index;
          const count = SIDEBAR_COUNTS[item.label];
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md border-l-2 px-2 py-1.5 text-xs transition-colors",
                isActive
                  ? "border-white/70 bg-white/[0.06] pl-[8px] text-white"
                  : "border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-white",
                FOCUS_RING
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              {count && (
                <span className="shrink-0 font-mono text-[10px] text-white/25">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User card */}
      <div className="mt-auto flex items-center gap-2 border-t border-white/[0.06] p-2.5">
        <span
          aria-hidden="true"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-[9px] font-semibold text-white"
        >
          AM
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-white/90">Alex Morgan</span>
        <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
          Pro
        </span>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* AgentActivity — bordered card inside the conversation               */
/* ------------------------------------------------------------------ */

function AgentActivity() {
  const CurrentFileIcon = FILE_ICON;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.015]">
      <p className="px-3 pt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        Activity
      </p>
      <ul className="py-1.5">
        {AGENT_ACTIVITY.map((item) => {
          const StatusIcon = ACTIVITY_ICONS[item.status];
          const styles = ACTIVITY_STYLES[item.status];
          return (
            <li key={item.label} className="flex items-center gap-2.5 px-3 py-1.5 text-xs">
              <StatusIcon
                className={cn("h-3.5 w-3.5 shrink-0", styles.icon)}
                aria-hidden="true"
              />
              <span className={cn("truncate", styles.label)}>{item.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-1.5 border-t border-white/[0.05] px-3 py-2 font-mono text-[10px] text-muted-foreground">
        <CurrentFileIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">app/(marketing)/page.tsx</span>
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[11px] w-[6px] animate-pulse bg-white/70"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AgentConversation — middle column                                   */
/* ------------------------------------------------------------------ */

function AgentConversation() {
  const [mode, setMode] = useState<Mode>("Build");
  const ChipIcon = AGENT_CHIP_ICON;

  return (
    <section
      aria-label="Agent conversation"
      className="flex min-w-0 flex-col lg:border-r lg:border-white/[0.06]"
    >
      {/* Column header */}
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <span className="text-xs font-medium text-white">Agent</span>
        <span className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1">
          <ChipIcon className="h-3 w-3 shrink-0 text-white/50" aria-hidden="true" />
          <span className="font-mono text-[10px] text-muted-foreground">MAXXEN-1</span>
          <span aria-hidden="true" className="hidden h-2.5 w-px bg-white/10 sm:block" />
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            <span className="font-mono text-[10px] text-white/70">streaming</span>
          </span>
        </span>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* User message */}
        <div className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-[9px] font-semibold text-white"
          >
            AM
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold text-white">
              {CONVERSATION.user.name}
              <span className="font-mono text-[9px] font-normal text-white/25">14:02</span>
            </p>
            <div className="rounded-xl rounded-tl-sm border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90">
              {CONVERSATION.user.message}
            </div>
          </div>
        </div>

        {/* Agent message */}
        <div className="flex gap-2.5">
          <LogoMark className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-baseline gap-1 text-[11px] font-semibold text-white">
              {CONVERSATION.agent.name}
              <BadgeCheck className="h-3 w-3 shrink-0 self-center text-white/60" aria-hidden="true" />
              <span className="font-mono text-[9px] font-normal text-white/25">14:02</span>
            </p>
            <div className="rounded-xl rounded-tl-sm border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/85">
              {CONVERSATION.agent.message}
            </div>
          </div>
        </div>

        {/* Activity card */}
        <AgentActivity />
      </div>

      {/* Mode chips */}
      <div className="flex items-center gap-1 px-3 pb-2 pt-1">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "mx-press rounded-md px-2.5 py-1.5 text-[10px] transition-colors",
              mode === m
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:text-white/70",
              FOCUS_RING
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="m-3 mt-0 flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5">
        <input
          type="text"
          readOnly
          placeholder="Ask MAXXEN to build anything…"
          aria-label="Ask MAXXEN"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/35"
        />
        <button
          type="button"
          aria-label="Attach file"
          className={cn("shrink-0 rounded-md p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60", FOCUS_RING)}
        >
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Send message"
          className={cn(
            "mx-press grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-black transition-opacity hover:opacity-80",
            FOCUS_RING
          )}
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CodePanel — right column content for the "Code" tab                 */
/* ------------------------------------------------------------------ */

function CodePanel() {
  return (
    <div className="flex h-full min-w-0">
      {/* Mini file tree */}
      <div className="hidden w-36 shrink-0 space-y-0.5 border-r border-white/[0.06] p-2 sm:block">
        {CODE_FILES.map((file) => {
          const isActive = file === "components/hero.tsx";
          return (
            <div
              key={file}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded border-l-2 py-1 pl-1.5 pr-1 font-mono text-[10px]",
                isActive
                  ? "border-white/60 bg-white/[0.06] text-white"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <FileCode2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{file}</span>
            </div>
          );
        })}
      </div>

      {/* Code area — line-number gutter + hand-colored source */}
      <div className="min-w-0 flex-1 overflow-hidden p-3">
        <div className="flex gap-2.5">
          <div aria-hidden="true" className="select-none text-right font-mono text-[10px] leading-[1.7] text-white/15">
            {HERO_CODE.map((_, i) => (
              <span key={i} className="block">
                {i + 1}
              </span>
            ))}
          </div>
          <pre className="min-w-0 overflow-hidden font-mono text-[10px] leading-[1.7]">
            <code>
              {HERO_CODE.map((line, i) => (
                <span key={i} className="block whitespace-pre">
                  {line.map((segment, j) => (
                    <span key={j} className={segment.c}>
                      {segment.t}
                    </span>
                  ))}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* WebsiteMock — the generated SaaS landing page inside the preview    */
/* ------------------------------------------------------------------ */

function WebsiteMock() {
  return (
    <div className="absolute inset-3 flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[#0b0b0b] p-4 md:p-6">
      {/* Mini nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="grid h-3 w-3 place-items-center rounded-[4px] bg-white text-[6px] font-bold leading-none text-black"
          >
            M
          </span>
          <span className="text-[9px] font-semibold text-white">Acme</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-white/40">Features</span>
          <span className="text-[8px] text-white/40">Pricing</span>
          <span className="text-[8px] text-white/40">Docs</span>
          <span className="rounded bg-white px-1.5 py-0.5 text-[8px] font-semibold text-black">
            Start
          </span>
        </div>
      </div>

      {/* Centered hero + features */}
      <div className="flex min-h-0 flex-1 flex-col justify-center py-4">
        {/* Mini hero */}
        <div className="text-center">
          <span className="inline-flex items-center rounded-full border border-white/10 px-1.5 py-0.5 text-[7px] text-white/50">
            New · v2.0
          </span>
          <h1 className="mt-2 text-[15px] font-semibold leading-tight tracking-tight text-white md:text-[17px]">
            Ship your best work.
          </h1>
          <p className="mx-auto mt-1.5 max-w-[70%] text-[8px] leading-snug text-white/40">
            The fastest way for modern teams to design, build, and ship software together.
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-semibold text-black">
              Get started
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-[8px] text-white/60">
              Learn more
            </span>
          </div>
        </div>

        {/* Mini feature grid */}
        <div className="mt-5 grid grid-cols-3 gap-2 md:mt-7">
          {MINI_FEATURES.map((feature) => {
            const FeatureIcon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-md border border-white/[0.07] bg-white/[0.02] p-2"
              >
                <span className="grid h-4 w-4 place-items-center rounded bg-white/[0.06]">
                  <FeatureIcon className="h-2.5 w-2.5 text-white/70" aria-hidden="true" />
                </span>
                <p className="mt-1.5 text-[9px] font-medium text-white">{feature.title}</p>
                <p className="mt-0.5 text-[7px] leading-snug text-white/35">{feature.line}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer strip */}
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.05] pt-2.5 font-mono text-[7px] text-white/25">
        <span>build #412 · passing</span>
        <span>preview ready</span>
      </div>

      {/* Generation toast */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[9px] text-white/70 backdrop-blur">
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        Generating… 3 files changed
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LivePreview — right column (toolbar + switchable content)           */
/* ------------------------------------------------------------------ */

function LivePreview({ tab }: { tab: WorkspaceTab }) {
  return (
    <section aria-label="Live preview" className="hidden min-w-0 flex-col bg-[#060606] lg:flex">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span className="truncate">maxxen.preview/saas-landing</span>
        </span>
        <button
          type="button"
          aria-label="Reload preview"
          className={cn("shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60", FOCUS_RING)}
        >
          <RotateCw className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Open in new tab"
          className={cn("shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60", FOCUS_RING)}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {/* Switchable content */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {tab === "Code" ? <CodePanel /> : <WebsiteMock />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* WorkspacePreview — the full-bleed product frame                     */
/* ------------------------------------------------------------------ */

export default function WorkspacePreview() {
  const [tab, setTab] = useState<WorkspaceTab>("Agent");

  return (
    <div className="relative ml-[calc(-50vw+50%)] w-screen max-w-[none] px-4 sm:px-6 md:px-10 lg:px-16">
      <div className="relative mx-auto max-w-7xl">
        {/* Subtle monochrome luminosity behind the frame */}
        <div
          aria-hidden="true"
          className="absolute -inset-x-8 -top-10 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(255,255,255,0.07),transparent_70%)] blur-2xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          role="img"
          aria-label="MAXXEN workspace preview showing an AI agent building a landing page with live preview"
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_40px_120px_-40px_rgba(255,255,255,0.12),0_8px_40px_-20px_rgba(0,0,0,0.9)]"
        >
          <WorkspaceHeader tab={tab} onTabChange={setTab} />
          <div className="grid h-[440px] grid-cols-1 md:h-[560px] md:grid-cols-[210px_minmax(0,1fr)] lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,1.05fr)] xl:h-[620px]">
            <WorkspaceSidebar />
            <AgentConversation />
            <LivePreview tab={tab} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
