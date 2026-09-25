import { LayoutGrid, FolderKanban, Bot, Blocks, Plug, Settings, Sparkles, FileCode2, Check, Loader2, Circle } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */
export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Workspace", href: "#workspace" },
  { label: "Agents", href: "#agents" },
  { label: "Showcase", href: "#showcase" },
] as const;

export const FOOTER_LINKS = [
  { label: "Product", href: "#workspace" },
  { label: "Agents", href: "#agents" },
  { label: "Pricing", href: "#" },
  { label: "Docs", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "Contact", href: "#" },
] as const;

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
export const HERO = {
  announcementBadge: "MAXXEN 1.0",
  announcementText: "Build. Iterate. Ship.",
  headlineLine1: "Build anything.",
  subtitle:
    "MAXXEN is your AI development workspace for turning ideas into production-ready apps, interfaces, and software — from one intelligent workspace.",
  primaryCta: "Start Building Free",
  secondaryCta: "Explore MAXXEN",
  socialProofCount: "12,400+",
} as const;

/* ------------------------------------------------------------------ */
/* Testimonial                                                         */
/* ------------------------------------------------------------------ */
export const TESTIMONIAL = {
  eyebrow: "Built for people who ship",
  quote:
    "MAXXEN changed the way we build software. Instead of jumping between an AI assistant, code editor, design tool, and browser, everything finally happens in one intelligent workspace.",
  author: "Alex Morgan",
  role: "Founder & Product Engineer",
  avatar: "/assets/testimonial-avatar.png",
} as const;

/* ------------------------------------------------------------------ */
/* Product philosophy                                                  */
/* ------------------------------------------------------------------ */
export const PHILOSOPHY = {
  headline: "One workspace. Every layer of creation.",
  supporting:
    "From the first idea to the final deployment, MAXXEN keeps your thinking, agents, code, design, and live product connected.",
} as const;

export interface WorkflowStepData {
  number: string;
  title: string;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStepData[] = [
  {
    number: "01",
    title: "Think",
    description:
      "Describe the idea in plain language. MAXXEN understands intent, constraints, and the product you have in mind.",
  },
  {
    number: "02",
    title: "Build",
    description:
      "MAXXEN generates the architecture, code, and design system — a real, production-ready application in moments.",
  },
  {
    number: "03",
    title: "Iterate",
    description:
      "Refine everything with agents, visual editing, and live previews. Every change is instant and reversible.",
  },
  {
    number: "04",
    title: "Ship",
    description:
      "Move from workspace to production without leaving the flow. Deploy, monitor, and keep building.",
  },
];

/* ------------------------------------------------------------------ */
/* Final CTA                                                           */
/* ------------------------------------------------------------------ */
export const FINAL_CTA = {
  headlineA: "Your next",
  headlineAccent: "product",
  headlineB: "starts here.",
  supporting: "Stop switching between tools. Start building inside MAXXEN.",
  primary: "Start Building Free",
  secondary: "View the Workspace",
} as const;

/* ------------------------------------------------------------------ */
/* Social proof avatars (AI-generated monochrome portraits)             */
/* ------------------------------------------------------------------ */
export const HERO_AVATARS = [
  { src: "/assets/avatars/avatar-1.png", alt: "" },
  { src: "/assets/avatars/avatar-2.png", alt: "" },
  { src: "/assets/avatars/avatar-5.png", alt: "" },
  { src: "/assets/avatars/avatar-3.png", alt: "" },
  { src: "/assets/avatars/avatar-6.png", alt: "" },
] as const;

export const FINAL_CTA_AVATARS = [
  { src: "/assets/avatars/avatar-2.png", alt: "" },
  { src: "/assets/avatars/avatar-4.png", alt: "" },
  { src: "/assets/avatars/avatar-1.png", alt: "" },
  { src: "/assets/avatars/avatar-5.png", alt: "" },
  { src: "/assets/avatars/avatar-3.png", alt: "" },
] as const;

/* ------------------------------------------------------------------ */
/* Workspace preview data                                              */
/* ------------------------------------------------------------------ */
export const SIDEBAR_ITEMS = [
  { label: "Workspace", icon: LayoutGrid, active: true },
  { label: "Projects", icon: FolderKanban, active: false },
  { label: "Agents", icon: Bot, active: false },
  { label: "Components", icon: Blocks, active: false },
  { label: "Integrations", icon: Plug, active: false },
  { label: "Settings", icon: Settings, active: false },
] as const;

export const AGENT_ACTIVITY = [
  { label: "Analyzing requirements", status: "done" },
  { label: "Creating component architecture", status: "done" },
  { label: "Building responsive layout", status: "running" },
  { label: "Generating interactions", status: "pending" },
  { label: "Running visual checks", status: "pending" },
] as const;

export const CONVERSATION = {
  user: {
    name: "You",
    message: "Build a premium landing page for my SaaS.",
  },
  agent: {
    name: "MAXXEN",
    message:
      "I'll create the structure, design system, responsive layout, and interactions.",
  },
} as const;

export const ACTIVITY_ICONS = { done: Check, running: Loader2, pending: Circle };
export const FILE_ICON = FileCode2;
export const AGENT_CHIP_ICON = Sparkles;

/* ================================================================== */
/* BRAND V2 — real MAXXEN product copy (maxxen.vercel.app) + chrome   */
/* Do not remove legacy exports above; WorkspacePreview still uses    */
/* SIDEBAR_ITEMS / AGENT_ACTIVITY / CONVERSATION / icon maps.          */
/* ================================================================== */

export const BRAND = {
  name: "MAXXEN",
  tagline: "Build at the speed of thought.",
  kicker: "YOUR KEYS · YOUR GITHUB · YOUR VERCEL",
  heroLead: "BUILD SOMETHING",
  heroChrome: "remarkable",
  heroTail: "DIFFERENT.",
  sub: "MAXXEN is a multipurpose agentic AI that designs, builds and deploys websites, apps and dashboards with you — running on your API keys, your GitHub and your Vercel.",
  primaryCta: "Start building — free",
  primaryCtaHref: "/chat",
  secondaryCta: "See how it works",
  secondaryCtaHref: "#how",
} as const;

export const HERO_CHIPS = [
  { value: "$0", label: "Platform cost" },
  { value: "10 min", label: "OTP lifetime" },
  { value: "500+", label: "Plugins via Composio" },
  { value: "100%", label: "Your infrastructure" },
] as const;

export const TICKER_ITEMS = [
  "WEBSITES",
  "APPS",
  "DASHBOARDS",
  "LANDING PAGES",
  "AGENTS",
  "AUTOMATIONS",
  "PROTOTYPES",
  "DEPLOYS",
] as const;

export interface SuperpowerCard {
  id: string;
  glyph: "chat" | "key" | "github" | "puzzle" | "rocket" | "mail";
  title: string;
  meta: string;
  body: string;
  tags: readonly string[];
}

export const SUPERPOWERS: readonly SuperpowerCard[] = [
  {
    id: "agent-chat",
    glyph: "chat",
    title: "Agent chat that builds",
    meta: "Chat → Build → Preview",
    body: "Describe anything — websites, apps, dashboards. MAXXEN plans the work, writes the code, and shows a live preview.",
    tags: ["Agent", "7 modes", "Live preview"],
  },
  {
    id: "byok",
    glyph: "key",
    title: "BYOK — zero cost for you",
    meta: "Gemini · OpenAI · OpenRouter",
    body: "Paste your own Gemini and ChatGPT keys, plus any custom base URL. Your keys never leave your browser.",
    tags: ["BYOK", "Browser-only", "Custom base URL"],
  },
  {
    id: "github",
    glyph: "github",
    title: "Storage in YOUR GitHub",
    meta: "maxxen-data · private",
    body: "Chats, projects and settings save to a private maxxen-data repo in your own account. Never the developer's.",
    tags: ["Private repo", "Your account"],
  },
  {
    id: "composio",
    glyph: "puzzle",
    title: "Plugins via YOUR Composio",
    meta: "500+ toolkits",
    body: "Connect Gmail, Notion, Slack, Sheets, GitHub and 500+ tools with your own Composio key. Your plugins, your data.",
    tags: ["Gmail", "Notion", "Slack", "Sheets"],
  },
  {
    id: "vercel",
    glyph: "rocket",
    title: "Deploy to YOUR Vercel",
    meta: "maxxen.vercel.app",
    body: "Ship what you build straight to your own Vercel project. This very site runs that way.",
    tags: ["One-click", "Your domain"],
  },
  {
    id: "otp",
    glyph: "mail",
    title: "10-minute email login",
    meta: "6 digits · auto-purged",
    body: "Passwordless OTP login. Codes live exactly 10 minutes, then vanish — nothing stored, nothing to leak.",
    tags: ["Passwordless", "Self-destruct"],
  },
] as const;

export const HOW_STEPS = [
  {
    number: "01",
    title: "Verify your email",
    body: "Get a 6-digit code at any address. It self-destructs in 10 minutes — nothing is stored.",
    terminal: "$ maxxen login you@mail.com\n✓ code sent · expires in 10:00",
  },
  {
    number: "02",
    title: "Bring your keys",
    body: "Paste Gemini / ChatGPT keys, your GitHub token and your Composio key. Everything stays in your browser.",
    terminal: "$ maxxen keys --byok\n✓ keys: browser-only",
  },
  {
    number: "03",
    title: "Build & deploy",
    body: "Chat in /chat, preview live builds, save to your GitHub, ship to your Vercel.",
    terminal: "$ maxxen deploy\n✓ storage: your-github/maxxen-data\n✓ live: your-vercel.app",
  },
] as const;

export const SECURITY_POINTS = [
  {
    title: "Keys never leave your browser",
    body: "BYOK calls go straight from your device to OpenAI / Google.",
  },
  {
    title: "Data in your private repo",
    body: "Chats and builds save to maxxen-data under your account.",
  },
  {
    title: "OTPs evaporate in 10 minutes",
    body: "Signed tickets carry their own expiry; leftovers are purged every request.",
  },
] as const;

export const FAQ_ITEMS = [
  {
    q: "Is MAXXEN AI free?",
    a: "Yes. There are no MAXXEN servers billing you — you bring your own Gemini / ChatGPT API key, so you only ever pay your AI provider (free tiers work fine). Hosting is your own Vercel, storage is your own GitHub.",
  },
  {
    q: "Where does my data go?",
    a: "Into a private maxxen-data repository inside YOUR GitHub account, created automatically from the token you paste. The developer cannot see it — the app literally has no database of its own.",
  },
  {
    q: "Which AI models work?",
    a: "Anything OpenAI-compatible plus Gemini: GPT-4o-mini, Gemini Flash, and custom base URLs like OpenRouter or Groq. Pick the model in /chat or Settings.",
  },
  {
    q: "How do plugins work?",
    a: "Paste YOUR Composio API key on the Plugins tab, connect toolkits (Gmail, Notion, Slack…) at app.composio.dev, and the agent can act on them. Keys stay in your browser.",
  },
] as const;

export const FOOTER_V2 = {
  links: [
    { label: "Chat", href: "/chat" },
    { label: "Login", href: "/login" },
    { label: "GitHub", href: "https://github.com/xmanya26911-bit/maxxen-ai" },
    { label: "Product", href: "#product" },
    { label: "Security", href: "#security" },
    { label: "FAQ", href: "#faq" },
  ] as readonly { label: string; href: string }[],
  meta: "BYOK · Your GitHub · Your Vercel",
  copyright: "© 2026 MAXXEN AI",
} as const;

export const CHAT_SUGGESTIONS = [
  { icon: "layout", title: "Build a landing page", prompt: "Build a landing page — premium editorial type, dark glass UI, single-file HTML." },
  { icon: "gauge", title: "Create a dashboard", prompt: "Create a task dashboard with a dark glass UI, charts and a sidebar." },
  { icon: "pen", title: "Design an app", prompt: "Design an app — a minimal habit tracker with Y2K chrome aesthetics." },
  { icon: "plug", title: "Connect an API", prompt: "Connect an API — wire my app to a streaming OpenAI-compatible endpoint." },
] as const;

/* Chat modes — mirrors the real MAXXEN /api/chat/stream MODES map. */
export const CHAT_MODES = [
  { id: "chat", label: "Chat", hint: "Talk freely — concise, helpful." },
  { id: "build", label: "Build", hint: "Single-file HTML artifact + live preview." },
  { id: "code", label: "Code", hint: "Code-first answers with file paths." },
  { id: "design", label: "Design", hint: "Product-designer output + notes." },
  { id: "research", label: "Research", hint: "Bullets, trade-offs, recommendation." },
  { id: "deploy", label: "Deploy", hint: "Ship to your own Vercel." },
  { id: "agent", label: "Agent", hint: "Engineering collaborator loop." },
] as const;

/* BYOK providers — mirrors PROVIDERS in the real app/chat/chrome.tsx. */
export const CHAT_PROVIDERS = [
  { id: "openai", glyph: "◈", label: "ChatGPT", model: "gpt-4o-mini" },
  { id: "anthropic", glyph: "✶", label: "Claude", model: "claude-3-5-haiku" },
  { id: "gemini", glyph: "⬢", label: "Gemini", model: "gemini-1.5-flash" },
  { id: "openrouter", glyph: "⬣", label: "All-in-one", model: "openai/gpt-4o-mini" },
] as const;
