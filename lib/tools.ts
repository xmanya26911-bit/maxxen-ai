import { Octokit } from "octokit";
import { assertSafeBaseURL } from "./net-guard";

export type Permission = "read" | "write" | "deploy" | "external";
export type Ctx = { githubToken?: string; vercelToken?: string; composioKey?: string; email?: string; userConfirmed?: boolean };

export type ToolResult = { ok: boolean; summary: string; data?: unknown; error?: string; needsConfirm?: boolean };

export type ToolDef = { id: string; kind: "project" | "deploy" | "composio"; permission: Permission; description: string; parameters: Record<string, unknown>; run: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult> };

const need = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new Error("Missing " + what + ".");
  return v.trim();
};

async function githubFile(owner: string, repo: string, oct: Octokit, path: string) {
  try {
    const cur = await oct.rest.repos.getContent({ owner, repo, path });
    if (!Array.isArray(cur.data) && cur.data.type === "file") return cur.data;
    return null;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export const WRITE_PREFIX = /^(builds|chats)\//;

export const registry: ToolDef[] = [
  {
    id: "project_list",
    kind: "project",
    permission: "read",
    description: "List files in the user's maxxen-data repo at a path (default root).",
    parameters: { path: "string, optional directory (default '')" },
    run: async (args, ctx) => {
      const token = need(ctx.githubToken, "GitHub token");
      const { cleanGithubPath } = await import("./github-guard");
      const path = cleanGithubPath(typeof args.path === "string" ? args.path : "", { allowRoot: true });
      if (path === null) return { ok: false, summary: "Invalid path." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      try {
        await oct.rest.repos.get({ owner: me.login, repo: "maxxen-data" });
      } catch {
        return { ok: true, summary: "Repo is empty (no maxxen-data yet).", data: [] };
      }
      const cur = await oct.rest.repos.getContent({ owner: me.login, repo: "maxxen-data", path });
      const items = (Array.isArray(cur.data) ? cur.data : [cur.data]).map((e: any) => ({ name: e.name, path: e.path, type: e.type, size: e.size ?? 0 }));
      return { ok: true, summary: items.length + " entries.", data: items };
    },
  },
  {
    id: "project_read",
    kind: "project",
    permission: "read",
    description: "Read a text file from the user's maxxen-data repo (200KB cap).",
    parameters: { path: "string, e.g. builds/abc/index.html" },
    run: async (args, ctx) => {
      const token = need(ctx.githubToken, "GitHub token");
      const rawPath = need(args.path, "path");
      const { cleanGithubPath } = await import("./github-guard");
      const path = cleanGithubPath(rawPath);
      if (!path) return { ok: false, summary: "Invalid path — reads limited to builds/, chats/, settings.json." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      const f: any = await githubFile(me.login, "maxxen-data", oct, path);
      if (!f) return { ok: false, summary: "Not found: " + path };
      if ((f.size ?? 0) > 200000) return { ok: false, summary: "File too large to read (200KB cap)." };
      const text = Buffer.from(f.content || "", "base64").toString("utf8");
      return { ok: true, summary: "Read " + path + ".", data: { path, text: text.slice(0, 60000) } };
    },
  },
  {
    id: "project_write",
    kind: "project",
    permission: "write",
    description: "Create/overwrite a file under builds/ or chats/ in the user's maxxen-data repo.",
    parameters: { path: "string under builds/ or chats/", content: "string (1MB max)", message: "optional commit message" },
    run: async (args, ctx) => {
      const token = need(ctx.githubToken, "GitHub token");
      const rawPath = need(args.path, "path");
      const p = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!WRITE_PREFIX.test(p) || p.includes("..")) return { ok: false, summary: "Writes limited to builds/ and chats/." };
      const content = typeof args.content === "string" ? args.content : "";
      if (!content) return { ok: false, summary: "Empty content — nothing written." };
      if (content.length > 1000000) return { ok: false, summary: "Content too large (1MB max)." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      try {
        await oct.rest.repos.get({ owner: me.login, repo: "maxxen-data" });
      } catch (e: any) {
        if (e?.status === 404) {
          try {
            await oct.rest.repos.createForAuthenticatedUser({ name: "maxxen-data", private: true, description: "Maxxen AI user storage" });
          } catch (c: any) {
            if (c?.status !== 422) throw c;
          }
        } else throw e;
      }
      let sha: string | undefined;
      const prev: any = await githubFile(me.login, "maxxen-data", oct, p);
      if (prev) sha = prev.sha;
      for (let i = 0; i < 3; i++) {
        try {
          await oct.rest.repos.createOrUpdateFileContents({ owner: me.login, repo: "maxxen-data", path: p, message: typeof args.message === "string" && args.message ? args.message.slice(0, 140) : ("maxxen agent: save " + p), content: Buffer.from(content).toString("base64"), sha });
          return { ok: true, summary: "Saved " + p + ".", data: { path: p } };
        } catch (e: any) {
          if (/sha|conflict|422/i.test(String(e?.message)) && i < 2) {
            const again: any = await githubFile(me.login, "maxxen-data", oct, p);
            sha = again?.sha;
            continue;
          }
          throw e;
        }
      }
      return { ok: false, summary: "Save conflicted repeatedly." };
    },
  },
  {
    id: "vercel_deploy_status",
    kind: "deploy",
    permission: "read",
    description: "Check a Vercel deployment's state on the user's account.",
    parameters: { deploymentId: "string (dpl_)" },
    run: async (args, ctx) => {
      const token = need(ctx.vercelToken, "Vercel token");
      const id = need(args.deploymentId, "deploymentId");
      const r = await fetch("https://api.vercel.com/v13/deployments/" + encodeURIComponent(id), { headers: { authorization: "Bearer " + token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, summary: "Vercel says HTTP " + r.status };
      return { ok: true, summary: "Deployment " + (j as any).id + " is " + ((j as any).readyState || (j as any).status) + ".", data: { id: (j as any).id, state: (j as any).readyState || (j as any).status, url: (j as any).url } };
    },
  },
  {
    id: "vercel_deploy",
    kind: "deploy",
    permission: "deploy",
    description: "Deploy static files to the user's Vercel project. REQUIRES explicit user confirmation.",
    parameters: { project: "string project name", files: "[{file, data}] small site, 4MB cap", target: "'production'|'preview'" },
    run: async (args, ctx) => {
      if (ctx.userConfirmed !== true) return { ok: false, summary: "Deployment needs explicit confirmation.", needsConfirm: true };
      const token = need(ctx.vercelToken, "Vercel token");
      const project = need(args.project, "project");
      const files = Array.isArray(args.files) ? args.files : [];
      if (!files.length || files.length > 200) return { ok: false, summary: "Provide 1-200 files." };
      let bytes = 0;
      const clean: { file: string; data: string }[] = [];
      for (const f of files) {
        if (!f || typeof (f as any).file !== "string" || typeof (f as any).data !== "string") continue;
        const rawName = (f as any).file.replace(/\\/g, "/").replace(/^\/+/, "");
        if (!rawName || rawName.length > 200 || rawName.includes("..")) continue;
        bytes += Buffer.byteLength((f as any).data, "utf8");
        if (bytes > 4 * 1024 * 1024) return { ok: false, summary: "Payload over 4MB." };
        clean.push({ file: rawName, data: (f as any).data });
      }
      if (!clean.length) return { ok: false, summary: "No valid files." };
      const r = await fetch("https://api.vercel.com/v13/deployments", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ name: project, target: args.target === "preview" ? "preview" : "production", files: clean, projectSettings: { framework: null } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, summary: "Vercel refused (HTTP " + r.status + ")" };
      return { ok: true, summary: "Deployment " + (j as any).id + " queued.", data: { id: (j as any).id, url: (j as any).url } };
    },
  },
  {
    id: "composio_execute",
    kind: "composio",
    permission: "external",
    description: "Run a Composio tool on the USER's connected account. Destructive calls need explicit confirmation.",
    parameters: { tool: "tool slug like GMAIL_SEND_EMAIL", params: "object of arguments", connectedAccountId: "optional" },
    run: async (args, ctx) => {
      const key = need(ctx.composioKey, "Composio key");
      const slug = need(args.tool, "tool slug");
      const params = args.params ?? {};
      if (params && (typeof params !== "object" || Array.isArray(params))) return { ok: false, summary: "params must be an object." };
      const hay = slug + " " + JSON.stringify(params);
      const destructive = /send|delete|remove|create|update|publish|post|forward|reply|archive|share|invite|trash/i.test(hay);
      if (destructive && ctx.userConfirmed !== true) return { ok: false, summary: slug + " changes the outside world — confirm explicitly first.", needsConfirm: true };
      const payload: Record<string, unknown> = { tool_slug: slug, arguments: params };
      if (typeof args.connectedAccountId === "string" && args.connectedAccountId) payload.connected_account_id = args.connectedAccountId;
      const r = await fetch("https://backend.composio.dev/api/v3/tools/execute", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, summary: "Composio refused (HTTP " + r.status + ")" };
      return { ok: true, summary: slug + " executed.", data: (j as any)?.data ?? j };
    },
  },
];

export function describeForModel(): { name: string; description: string; parameters: Record<string, unknown> }[] {
  return registry.map((t) => ({ name: t.id, description: t.description, parameters: t.parameters }));
}

const SCHEMAS: Record<string, unknown> = {
  project_list: { type: "object", properties: { path: { type: "string" } } },
  project_read: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  project_write: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, message: { type: "string" } }, required: ["path", "content"] },
  vercel_deploy_status: { type: "object", properties: { deploymentId: { type: "string" } }, required: ["deploymentId"] },
  vercel_deploy: { type: "object", properties: { project: { type: "string" }, files: { type: "array" }, target: { type: "string" }, confirm: { type: "boolean" } }, required: ["project", "files", "confirm"] },
  composio_execute: { type: "object", properties: { tool: { type: "string" }, params: { type: "object" }, connectedAccountId: { type: "string" }, confirm: { type: "boolean" } }, required: ["tool", "params"] },
};

export function toOpenAITools() {
  return registry.map((t) => ({
    type: "function" as const,
    function: { name: t.id, description: t.description + " (Maxxen permission: " + t.permission + ")", parameters: SCHEMAS[t.id] || { type: "object", properties: {} } },
  }));
}

export { assertSafeBaseURL };