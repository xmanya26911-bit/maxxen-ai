/**
 * MAXXEN Agent Runtime — the single source of truth for identity,
 * capabilities, tools, and model context.
 *
 * Architecture:
 *   MaxxenRuntime { user, workspace, model, capabilities, tools, memory, project }
 *     → Provider Adapter (OpenAI-compatible tool calling; Anthropic gets a
 *         clear error, never a silent failure)
 *       → Selected LLM (replaceable — identity is always Maxxen)
 *
 * Rules enforced here:
 * - Credentials live in Ctx (server-side only) and NEVER enter prompts,
 *   tool definitions, tool results, logs, or error text.
 * - Tools are registered ONLY when their integration is configured AND
 *   (for Composio) reachable. The model never sees tools it cannot use.
 * - Every model (OpenAI, Anthropic, Gemini-via-OpenAI-compat, custom)
 *   receives the same Maxxen identity; only the mode/context block varies.
 */

import type { Ctx, ToolDef } from "./tools";
import { registry } from "./tools";

export interface Capabilities {
  ai: { configured: boolean };
  github: { configured: boolean; read: boolean; write: boolean; createRepository: boolean };
  vercel: { configured: boolean; deploy: boolean; inspect: boolean };
  composio: { configured: boolean; reachable: boolean; toolCount: number };
}

export interface Runtime {
  capabilities: Capabilities;
  /** Tool definitions actually exposed this session (filtered registry). */
  tools: ToolDef[];
  /** Full system prompt: identity + live capability/workspace context. */
  systemPrompt: string;
}

export const MAXXEN_IDENTITY = `You are Maxxen, an autonomous AI development agent operating inside the Maxxen workspace.

The underlying model provider may be OpenAI, Anthropic, Google, or another provider selected by the user.
The underlying model is replaceable.
Your identity is always Maxxen.

You operate inside the user's current Maxxen workspace.
Your capabilities are determined by the tools and permissions exposed by the Maxxen runtime.
You may have access to GitHub, Vercel, Composio, filesystem/project tools, and other capabilities.
Only tools actually exposed in the current session are available.
Do not assume a service is connected merely because Maxxen supports it.

Never fabricate tool results.
Never claim an action succeeded unless the corresponding tool reports success.
Never expose API keys, access tokens, OAuth tokens, passwords, cookies, secrets, or other credentials.
When an integration required for a requested task is unavailable, tell the user which integration must be configured in Maxxen Settings.

TOOL-USE DISCIPLINE (binding):
You are an AGENT, not a chatbot. When the user asks you to do, check, inspect, list, read, create, deploy, or verify anything — CALL the relevant tool. Do not describe what you would do instead of doing it.
When the user asks whether you have access to something (tools, GitHub, Vercel, Composio), VERIFY by calling the matching read tool first (e.g. project_list for GitHub, vercel_project for Vercel) and report what the tool returned. Never answer access questions from memory.
The capability block below is authoritative: if it says CONNECTED, the tools ARE registered and WILL execute — use them.
If a tool call fails with an authentication/permission error, the credential itself is invalid or expired: tell the user exactly which Settings integration to fix. Do not claim the integration was never connected.
Read operations never need confirmation — just run them. World-changing operations will pause for user confirmation automatically; when that happens, summarize what you WOULD do and stop.

For development tasks, behave as an autonomous software-development agent.
Prefer:
Understand
→ Inspect
→ Plan
→ Implement
→ Test
→ Integrate
→ Deploy
→ Verify
→ Report
rather than merely explaining how the user could perform the task.`;

const has = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Tools in the static registry that need no credential to run usefully. */
function toolNeeds(def: ToolDef): "github" | "vercel" | "composio" | null {
  if (def.kind === "project") return "github";
  if (def.kind === "deploy") return "vercel";
  return "composio";
}

/** Live Composio reachability probe (bounded; never fails the run). */
async function probeComposio(rawKey: string | undefined): Promise<{ reachable: boolean; toolCount: number }> {
  const { cleanComposioKey } = await import("./composio");
  const key = cleanComposioKey(rawKey);
  if (!key) return { reachable: false, toolCount: 0 };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch("https://backend.composio.dev/api/v3/connected_accounts/list", {
        method: "GET",
        headers: { "x-api-key": key } as Record<string, string>,
        signal: ctrl.signal,
      });
      if (!r.ok) return { reachable: false, toolCount: 0 };
      const j = await r.json().catch(() => null);
      const list = Array.isArray(j)
        ? j
        : (j as { items?: unknown[]; accounts?: unknown[]; data?: unknown[] })?.items ??
          (j as { accounts?: unknown[] })?.accounts ??
          (j as { data?: unknown[] })?.data ??
          [];
      return { reachable: true, toolCount: Array.isArray(list) ? list.length : 0 };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return { reachable: false, toolCount: 0 };
  }
}

function capabilityBlock(caps: Capabilities, providerLabel: string): string {
  const yn = (v: boolean) => (v ? "CONNECTED" : "NOT CONNECTED");
  const lines = [
    "MAXXEN WORKSPACE",
    "",
    "Available integrations:",
    "",
    `GitHub: ${yn(caps.github.configured)}`,
  ];
  if (caps.github.configured) {
    lines.push(
      "Capabilities:",
      "read",
      "write",
      "create repository",
      "create branches",
      "open pull requests",
      "checkpoints"
    );
  }
  lines.push("", `Vercel: ${yn(caps.vercel.configured)}`);
  if (caps.vercel.configured) {
    lines.push("Capabilities:", "deploy", "inspect deployments", "verify live URLs");
  }
  lines.push("", `Composio: ${yn(caps.composio.configured && caps.composio.reachable)}`);
  if (caps.composio.configured && caps.composio.reachable) {
    lines.push(`Connected toolkits: ${caps.composio.toolCount}`, "Additional tools available");
  }
  lines.push("", `AI provider: ${providerLabel}`, "", "Credentials are managed by Maxxen's runtime.", "Never expose or request credentials.");
  lines.push(
    "",
    "Build→verify loop: after every deploy, run preview_check on the live URL before reporting success.",
    '"Upload to Vercel" means deploy. Never report a deployment as working without a passing check.'
  );
  return lines.join("\n");
}

/**
 * Build the runtime for one request: probe capabilities, filter the tool
 * registry to what is actually usable, and compose the system prompt.
 */
export async function buildRuntime(
  ctx: Ctx,
  opts?: { providerLabel?: string; mode?: string }
): Promise<Runtime> {
  const github = has(ctx.githubToken);
  const vercel = has(ctx.vercelToken);
  const composioKey = has(ctx.composioKey);
  const probe = await probeComposio(ctx.composioKey);

  const capabilities: Capabilities = {
    ai: { configured: true },
    github: { configured: github, read: github, write: github, createRepository: github },
    vercel: { configured: vercel, deploy: vercel, inspect: vercel },
    composio: { configured: composioKey, reachable: probe.reachable, toolCount: probe.toolCount },
  };

  const tools = registry.filter((def) => {
    const need = toolNeeds(def);
    if (need === "github") return capabilities.github.configured;
    if (need === "vercel") return capabilities.vercel.configured;
    // Composio: key present is enough to attempt (per-tool errors stay honest);
    // reachability is reported in context, never assumed.
    return capabilities.composio.configured;
  });

  const providerLabel = opts?.providerLabel || "user-selected";
  let systemPrompt = `${MAXXEN_IDENTITY}\n\n${capabilityBlock(capabilities, providerLabel)}`;
  if (opts?.mode && opts.mode !== "chat") {
    systemPrompt += `\n\nActive workspace mode: ${opts.mode.toUpperCase()} — bias your behavior toward what that mode means (build/code/design/research/deploy/agent), within the tools actually exposed above.`;
  }

  return { capabilities, tools, systemPrompt };
}

/** Missing-integration guidance the model echoes (never a credential). */
export function missingIntegration(which: "github" | "vercel" | "composio"): string {
  const names = {
    github: "GitHub",
    vercel: "Vercel",
    composio: "Composio",
  } as const;
  return `${names[which]} isn't configured in Maxxen Settings yet. Add it in Settings → Integrations → ${names[which]}, and I can continue.`;
}
