import { Octokit } from "octokit";
import { assertSafeBaseURL } from "./net-guard";

// MAXXEN tool registry — every entry has a REAL implementation below.
// Kinds: project (user's GitHub), deploy (user's Vercel), composio (user's key).
// Permissions gate destructive/visible effects BEFORE execution:
// - read: always allowed
// - write: allowlisted paths only (builds/, chats/, settings.json)
// - deploy: requires explicit confirm:true (user gesture in UI)
// - external: composio actions run (user connected the toolkit themselves),
//   but destructive-looking ones (send/delete/remove in the slug or args)
//   require confirm:true too.

export type Permission = "read" | "write" | "deploy" | "external";
// userConfirmed must come from an explicit human gesture (UI "Confirm" button →
// "Confirmed:" user message), NEVER from model-supplied tool args. The agent
// loop strips args.confirm before execution — see app/api/agent/run.
export type Ctx = { githubToken?: string; vercelToken?: string; composioKey?: string; email?: string; userConfirmed?: boolean };

export type ToolResult = { ok: boolean; summary: string; data?: unknown; error?: string; needsConfirm?: boolean };

export type ToolDef = {
  id: string;
  kind: "project" | "deploy" | "composio";
  permission: Permission;
  description: string;
  parameters: Record<string, unknown>; // JSON-schema-ish, human-readable
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult>;
};

const need = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new Error(what);
  return v.trim();
};

/** Missing-credential errors always direct the user to Settings (never a key). */
const needGithub = (v: unknown) =>
  need(v, "GitHub isn't configured in Maxxen Settings yet. Add your GitHub token in Settings → Integrations → GitHub.");
const needVercel = (v: unknown) =>
  need(v, "Vercel isn't configured in Maxxen Settings yet. Add your Vercel token in Settings → Integrations → Vercel.");
const needComposio = (v: unknown) =>
  need(v, "Composio isn't configured in Maxxen Settings yet. Add your Composio API key in Settings → Integrations → Composio.");

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
      const token = needGithub(ctx.githubToken);
      const { cleanGithubPath } = await import("./github-guard");
      const path = cleanGithubPath(typeof args.path === "string" ? args.path : "", { allowRoot: true });
      if (path === null) return { ok: false, summary: "Invalid path — list limited to root, builds/, chats/, settings.json." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      try {
        await oct.rest.repos.get({ owner: me.login, repo: "maxxen-data" });
      } catch {
        return { ok: true, summary: "Repo is empty (no maxxen-data yet).", data: [] };
      }
      const cur = await oct.rest.repos.getContent({ owner: me.login, repo: "maxxen-data", path });
      const items = (Array.isArray(cur.data) ? cur.data : [cur.data]).map((e: any) => ({ name: e.name, path: e.path, type: e.type, size: e.size ?? 0 }));
      return { ok: true, summary: `${items.length} entr${items.length === 1 ? "y" : "ies"} under '${path || "/"}'.`, data: items };
    },
  },
  {
    id: "project_read",
    kind: "project",
    permission: "read",
    description: "Read a text file from the user's maxxen-data repo (200KB cap).",
    parameters: { path: "string, e.g. builds/abc/index.html" },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      const rawPath = need(args.path, "path");
      const { cleanGithubPath } = await import("./github-guard");
      const path = cleanGithubPath(rawPath);
      if (!path) return { ok: false, summary: "Invalid path — reads limited to builds/, chats/, settings.json." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      const f: any = await githubFile(me.login, "maxxen-data", oct, path);
      if (!f) return { ok: false, summary: `Not found: ${path}` };
      if ((f.size ?? 0) > 200000) return { ok: false, summary: "File too large to read (200KB cap)." };
      const text = Buffer.from(f.content || "", "base64").toString("utf8");
      return { ok: true, summary: `Read ${path} (${f.size} bytes).`, data: { path, text: text.slice(0, 60000) } };
    },
  },
  {
    id: "project_write",
    kind: "project",
    permission: "write",
    description: "Create/overwrite a file under builds/ or chats/ in the user's maxxen-data repo.",
    parameters: { path: "string under builds/ or chats/", content: "string (1MB max)", message: "optional commit message" },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      const rawPath = need(args.path, "path");
      const p = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!WRITE_PREFIX.test(p) || p.includes("..")) return { ok: false, summary: "Writes limited to builds/ and chats/." };
      const content = typeof args.content === "string" ? args.content : "";
      if (!content) return { ok: false, summary: "Empty content — nothing written." };
      if (content.length > 1000000) return { ok: false, summary: "Content too large (1MB max)." };
      const { scanForSecrets, secretRefusal } = await import("./secret-scan");
      const leaks = scanForSecrets(content);
      if (leaks.length) return { ok: false, summary: secretRefusal(leaks, p) };
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
          await oct.rest.repos.createOrUpdateFileContents({
            owner: me.login,
            repo: "maxxen-data",
            path: p,
            message: typeof args.message === "string" && args.message ? args.message.slice(0, 140) : `maxxen agent: save ${p}`,
            content: Buffer.from(content).toString("base64"),
            sha,
          });
          return { ok: true, summary: `Saved ${p} to YOUR repo ${me.login}/maxxen-data.`, data: { path: p } };
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
    id: "project_create_repo",
    kind: "project",
    permission: "write",
    description:
      "Create a new repository in the user's own GitHub account for a built project. Visibility policy: pass private:true/false explicitly; omit it to ask the user first (returns needsConfirm). REQUIRES explicit user confirmation (userConfirmed).",
    parameters: {
      name: "string, repository name, e.g. tic-tac-toe",
      private: "boolean, REQUIRED — true for private, false for public (omit to ask the user)",
      description: "optional repository description",
    },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      const name =
        typeof args.name === "string" ? args.name.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") : "";
      if (!name || name.length > 100) return { ok: false, summary: "Provide a valid repository name." };
      if (typeof args.private !== "boolean") {
        return {
          ok: false,
          summary: `Should "${name}" be PUBLIC or PRIVATE? Ask the user and retry with private:true/false.`,
          needsConfirm: true,
        };
      }
      if (ctx.userConfirmed !== true) {
        return {
          ok: false,
          summary: `Creating repository "${name}" (${args.private ? "private" : "public"}) needs explicit confirmation.`,
          needsConfirm: true,
        };
      }
      const oct = new Octokit({ auth: token });
      try {
        const { data: repo } = await oct.rest.repos.createForAuthenticatedUser({
          name,
          private: args.private,
          description:
            typeof args.description === "string" && args.description
              ? args.description.slice(0, 200)
              : "Built with Maxxen",
        });
        return {
          ok: true,
          summary: `Repository created: ${repo.full_name} (${repo.private ? "private" : "public"}).`,
          data: { name: repo.name, fullName: repo.full_name, url: repo.html_url, private: repo.private },
        };
      } catch (e: any) {
        const msg = String(e?.message || "Create failed");
        if (/name already exists|422/i.test(msg)) {
          return { ok: false, summary: `A repository named "${name}" already exists on your account — pick another name or confirm reuse.` };
        }
        return { ok: false, summary: `Repository creation failed: ${msg.slice(0, 300)}` };
      }
    },
  },
  {
    id: "project_commit_file",
    kind: "project",
    permission: "write",
    description:
      "Create or update a file in one of the user's own repositories (project repos created for built apps). Scans content for credential leakage and REFUSES on detection. REQUIRES explicit user confirmation (userConfirmed) — the user explicitly requesting the workflow counts.",
    parameters: {
      repo: "string, repository name in the user's account, e.g. tic-tac-toe",
      path: "string, file path, e.g. index.html",
      content: "string, full file content (1MB max)",
      message: "optional commit message",
    },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      if (ctx.userConfirmed !== true) {
        return { ok: false, summary: "Committing project files needs explicit confirmation.", needsConfirm: true };
      }
      const repo = typeof args.repo === "string" ? args.repo.trim() : "";
      if (!repo || /[^\w.-]/.test(repo)) return { ok: false, summary: "Provide a valid repository name." };
      const rawPath = typeof args.path === "string" ? args.path : "";
      const p = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!p || p.includes("..") || p.length > 200) return { ok: false, summary: "Invalid file path." };
      const content = typeof args.content === "string" ? args.content : "";
      if (!content) return { ok: false, summary: "Empty content — nothing written." };
      if (content.length > 1000000) return { ok: false, summary: "Content too large (1MB max)." };
      const { scanForSecrets, secretRefusal } = await import("./secret-scan");
      const leaks = scanForSecrets(content);
      if (leaks.length) return { ok: false, summary: secretRefusal(leaks, `${repo}/${p}`) };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      let sha: string | undefined;
      const prev: any = await githubFile(me.login, repo, oct, p);
      if (prev) sha = prev.sha;
      try {
        await oct.rest.repos.createOrUpdateFileContents({
          owner: me.login,
          repo,
          path: p,
          message:
            typeof args.message === "string" && args.message ? args.message.slice(0, 140) : `maxxen: save ${p}`,
          content: Buffer.from(content).toString("base64"),
          sha,
        });
        return {
          ok: true,
          summary: `Committed ${p} to YOUR repo ${me.login}/${repo}.`,
          data: { repo, path: p, url: `https://github.com/${me.login}/${repo}/blob/main/${p}` },
        };
      } catch (e: any) {
        return { ok: false, summary: `Commit failed: ${String(e?.message || e).slice(0, 300)}` };
      }
    },
  },
  {
    id: "vercel_project",
    kind: "deploy",
    permission: "read",
    description:
      "Inspect a Vercel project on the user's account (framework, targets, latest production URL). Use before deploying to verify the project exists and where it serves.",
    parameters: { project: "string, project name or id, e.g. maxxen" },
    run: async (args, ctx) => {
      const token = needVercel(ctx.vercelToken);
      const project = need(args.project, "project");
      const r = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 404) return { ok: false, summary: `No Vercel project named "${project}" on your account yet — deploying will create it.` };
        return { ok: false, summary: `Vercel says HTTP ${r.status}: ${(j as any)?.error?.message || "unknown"}` };
      }
      const targets = (j as any)?.targets?.production?.url;
      return {
        ok: true,
        summary: `Project ${(j as any).name} (${(j as any)?.framework?.name || "unknown framework"})${targets ? ` serves https://${targets}` : ""}.`,
        data: { id: (j as any).id, name: (j as any).name, url: targets ? `https://${targets}` : null },
      };
    },
  },
  {
    id: "preview_check",
    kind: "deploy",
    permission: "read",
    description:
      "Verify a live URL the way a browser agent would at HTTP level: status, page title, and an inventory of links/images/scripts. Use after every deploy (and after every fix) to confirm the app actually serves before reporting success. Never report a deployment as working without a passing preview_check.",
    parameters: { url: "string, https URL to verify, e.g. https://my-app.vercel.app" },
    run: async (args, ctx) => {
      const raw = typeof args.url === "string" ? args.url.trim() : "";
      if (!raw) return { ok: false, summary: "Provide a URL to check." };
      let safe: string;
      try {
        const { assertSafeBaseURL } = await import("./net-guard");
        const u = new URL(raw);
        if (u.protocol !== "https:") return { ok: false, summary: "Only https URLs can be checked." };
        assertSafeBaseURL(raw, "");
        safe = u.toString();
      } catch (e: any) {
        return { ok: false, summary: `Unsafe or invalid URL: ${e?.message || e}` };
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      try {
        const r = await fetch(safe, {
          signal: ctrl.signal,
          headers: { "user-agent": "Maxxen-verify/1.0" },
          redirect: "follow",
        });
        const text = await r.text().catch(() => "");
        const title = /<title[^>]*>([^<]{1,140})/i.exec(text)?.[1]?.trim() || "(no title)";
        const links = new Set<string>();
        const linkRe = /<(a|link)[^>]+href=["']([^"'#]+)["']/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(text)) && links.size < 20) {
          if (!m[2].startsWith("data:") && !m[2].startsWith("javascript:")) links.add(m[2].slice(0, 120));
        }
        const scripts = (text.match(/<script\b/gi) || []).length;
        const images = (text.match(/<img\b/gi) || []).length;
        const ok = r.ok;
        return {
          ok,
          summary: ok
            ? `LIVE ✓ ${r.status} — "${title}" (${(text.length / 1024).toFixed(1)}KB, ${links.size} links, ${images} images, ${scripts} scripts).`
            : `NOT LIVE ✗ HTTP ${r.status} at ${safe} — diagnose before reporting success.`,
          data: { url: safe, status: r.status, title, links: [...links], images, scripts, bytes: text.length },
        };
      } catch (e: any) {
        return {
          ok: false,
          summary: `Unreachable: ${e?.name === "AbortError" ? "timed out after 25s" : String(e?.message || e).slice(0, 200)}`,
        };
      } finally {
        clearTimeout(t);
      }
    },
  },
  {
    id: "project_create_branch",
    kind: "project",
    permission: "write",
    description:
      "Create a branch in one of the user's own repositories off main (or a given base). Part of the GitHub-native workflow: branch → changes → commit → pull request.",
    parameters: {
      repo: "string, repository name in the user's account",
      branch: "string, new branch name, e.g. maxxen/artifact-login",
      base: "optional base branch (default: the repo default)",
    },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      const repo = typeof args.repo === "string" ? args.repo.trim() : "";
      const branch = typeof args.branch === "string" ? args.branch.trim().replace(/[^a-zA-Z0-9/_.-]+/g, "-") : "";
      if (!repo || !branch || branch.length > 120)
        return { ok: false, summary: "Provide a valid repo and branch name." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      try {
        const { data: info } = await oct.rest.repos.get({ owner: me.login, repo });
        const base = typeof args.base === "string" && args.base ? args.base : info.default_branch || "main";
        const { data: ref } = await oct.rest.git.getRef({ owner: me.login, repo, ref: `heads/${base}` });
        await oct.rest.git.createRef({ owner: me.login, repo, ref: `refs/heads/${branch}`, sha: ref.object.sha });
        return {
          ok: true,
          summary: `Branch created: ${me.login}/${repo}@${branch} (from ${base}).`,
          data: { repo, branch, base, url: `https://github.com/${me.login}/${repo}/tree/${branch}` },
        };
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (/Reference already exists|422/i.test(msg))
          return { ok: false, summary: `Branch "${branch}" already exists — reuse it or pick another name.` };
        return { ok: false, summary: `Branch creation failed: ${msg.slice(0, 300)}` };
      }
    },
  },
  {
    id: "project_open_pr",
    kind: "project",
    permission: "write",
    description:
      "Open a pull request in one of the user's own repositories (head → base, default base = repo default). Returns the PR URL. Requires explicit user confirmation for repos the user did not ask to publish.",
    parameters: {
      repo: "string, repository name in the user's account",
      head: "string, source branch",
      base: "optional target branch (default: repo default)",
      title: "string, PR title",
      body: "optional PR description",
    },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      if (ctx.userConfirmed !== true) {
        return { ok: false, summary: "Opening a pull request needs explicit confirmation.", needsConfirm: true };
      }
      const repo = typeof args.repo === "string" ? args.repo.trim() : "";
      const head = typeof args.head === "string" ? args.head.trim() : "";
      const title = typeof args.title === "string" ? args.title.trim().slice(0, 140) : "";
      if (!repo || !head || !title) return { ok: false, summary: "Provide repo, head branch, and title." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      try {
        const { data: info } = await oct.rest.repos.get({ owner: me.login, repo });
        const base =
          typeof args.base === "string" && args.base.trim() ? args.base.trim() : info.default_branch || "main";
        const { data: pr } = await oct.rest.pulls.create({
          owner: me.login,
          repo,
          head,
          base,
          title,
          body: typeof args.body === "string" ? args.body.slice(0, 2000) : "Opened by Maxxen.",
        });
        return {
          ok: true,
          summary: `Pull request opened: ${pr.html_url} (${pr.state}).`,
          data: { number: pr.number, url: pr.html_url, state: pr.state },
        };
      } catch (e: any) {
        return { ok: false, summary: `PR creation failed: ${String(e?.message || e).slice(0, 300)}` };
      }
    },
  },
  {
    id: "checkpoint_create",
    kind: "project",
    permission: "write",
    description:
      "Snapshot the current workspace (conversation id + saved-builds manifest) to maxxen-data/checkpoints/<id>.json BEFORE major AI changes. Returns a checkpoint id with a Restore affordance.",
    parameters: { label: "string, what this checkpoint covers, e.g. before-auth-rewrite" },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      const label =
        typeof args.label === "string"
          ? args.label.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "checkpoint"
          : "checkpoint";
      const id = `${Date.now().toString(36)}-${label}`;
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      const manifest = {
        id,
        label,
        createdAt: new Date().toISOString(),
        note: "Restore = read this file, then re-apply its builds snapshot via project_write/project_commit_file.",
      };
      await oct.rest.repos.createOrUpdateFileContents({
        owner: me.login,
        repo: "maxxen-data",
        path: `checkpoints/${id}.json`,
        message: `maxxen: checkpoint ${id}`,
        content: Buffer.from(JSON.stringify(manifest, null, 2)).toString("base64"),
      });
      return {
        ok: true,
        summary: `CHECKPOINT CREATED — before: ${id}. Restore reads checkpoints/${id}.json from YOUR repo.`,
        data: { id, path: `checkpoints/${id}.json` },
      };
    },
  },
  {
    id: "checkpoint_restore",
    kind: "project",
    permission: "read",
    description: "Read a checkpoint manifest back (lists what the workspace held). The agent then re-applies the snapshot it describes.",
    parameters: { id: "string, checkpoint id from checkpoint_create" },
    run: async (args, ctx) => {
      const token = needGithub(ctx.githubToken);
      const id = typeof args.id === "string" ? args.id.trim().replace(/[^a-zA-Z0-9_-]+/g, "") : "";
      if (!id) return { ok: false, summary: "Provide a checkpoint id." };
      const oct = new Octokit({ auth: token });
      const { data: me } = await oct.rest.users.getAuthenticated();
      const f: any = await githubFile(me.login, "maxxen-data", oct, `checkpoints/${id}.json`);
      if (!f) return { ok: false, summary: `Checkpoint "${id}" not found.` };
      const text = Buffer.from(f.content || "", "base64").toString("utf8");
      return { ok: true, summary: `Checkpoint "${id}" loaded — re-apply its snapshot now.`, data: { id, manifest: text.slice(0, 60000) } };
    },
  },
  {
    id: "vercel_deploy_status",
    kind: "deploy",
    permission: "read",
    description: "Check a Vercel deployment's state (QUEUED/BUILDING/READY/ERROR/CANCELED) on the user's account.",
    parameters: { deploymentId: "string (dpl_…)" },
    run: async (args, ctx) => {
      const token = needVercel(ctx.vercelToken);
      const id = need(args.deploymentId, "deploymentId");
      const r = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, summary: `Vercel says HTTP ${r.status}: ${(j as any)?.error?.message || "unknown"}` };
      return {
        ok: true,
        summary: `Deployment ${(j as any).id} is ${(j as any).readyState || (j as any).status} at https://${(j as any).url}.`,
        data: { id: (j as any).id, state: (j as any).readyState || (j as any).status, url: (j as any).url },
      };
    },
  },
  {
    id: "vercel_deploy",
    kind: "deploy",
    permission: "deploy",
    description: "Deploy static files to the user's Vercel project. REQUIRES explicit user confirmation (confirm:true).",
    parameters: { project: "string project name", files: "[{file, data}] small site, 4MB cap", target: "'production'|'preview'", confirm: "must be true" },
    run: async (args, ctx) => {
      // Human-gated: model-supplied args.confirm is IGNORED (stripped in agent/run).
      // Only ctx.userConfirmed (from explicit "Confirmed:" user message) allows deploy.
      if (ctx.userConfirmed !== true) return { ok: false, summary: "Deployment needs explicit confirmation.", needsConfirm: true };
      const token = needVercel(ctx.vercelToken);
      const project = need(args.project, "project");
      const files = Array.isArray(args.files) ? args.files : [];
      if (!files.length || files.length > 200) return { ok: false, summary: "Provide 1–200 files." };
      let bytes = 0;
      const clean: { file: string; data: string }[] = [];
      for (const f of files) {
        if (!f || typeof (f as any).file !== "string" || typeof (f as any).data !== "string") continue;
        const rawName = (f as any).file.replace(/\\/g, "/").replace(/^\/+/, "");
        if (!rawName || rawName.length > 200 || rawName.includes("..")) continue;
        const name = rawName;
        if (!name) continue;
        bytes += Buffer.byteLength((f as any).data, "utf8");
        if (bytes > 4 * 1024 * 1024) return { ok: false, summary: "Payload over 4MB." };
        clean.push({ file: name, data: (f as any).data });
      }
      if (!clean.length) return { ok: false, summary: "No valid files." };
      const r = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: project,
          target: args.target === "preview" ? "preview" : "production",
          files: clean,
          projectSettings: { framework: null },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, summary: `Vercel refused (HTTP ${r.status}): ${(j as any)?.error?.message || "unknown"}` };
      return { ok: true, summary: `Deployment ${(j as any).id} queued → https://${(j as any).url}.`, data: { id: (j as any).id, url: (j as any).url } };
    },
  },
  {
    id: "composio_execute",
    kind: "composio",
    permission: "external",
    description: "Run a Composio tool on the USER's connected account (e.g. send an email, create a page). Destructive-looking calls need confirm:true.",
    parameters: { tool: "tool slug like GMAIL_SEND_EMAIL", params: "object of arguments", connectedAccountId: "optional", confirm: "required true for send/delete/remove/create" },
    run: async (args, ctx) => {
      const key = needComposio(ctx.composioKey);
      const slug = need(args.tool, "tool slug");
      const params = args.params ?? {};
      if (params && (typeof params !== "object" || Array.isArray(params))) return { ok: false, summary: "params must be an object." };
      // Scan FULL payload (no 500-char slice bypass) + broader verbs.
      const hay = `${slug} ${JSON.stringify(params)}`;
      const destructive = /send|delete|remove|create|update|publish|post|forward|reply|archive|share|invite|trash/i.test(hay);
      // Human-gated: ignore model-supplied args.confirm, require ctx.userConfirmed.
      if (destructive && ctx.userConfirmed !== true)
        return { ok: false, summary: `“${slug}” changes the outside world — confirm explicitly first.`, needsConfirm: true };
      const payload: Record<string, unknown> = { tool_slug: slug, arguments: params };
      if (typeof args.connectedAccountId === "string" && args.connectedAccountId) payload.connected_account_id = args.connectedAccountId;
      const r = await fetch("https://backend.composio.dev/api/v3/tools/execute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const { composioErrorDetail } = await import("./composio");
        return { ok: false, summary: `Composio refused the call (${composioErrorDetail(j, r.status)})` };
      }
      return { ok: true, summary: `“${slug}” executed.`, data: (j as any)?.data ?? j };
    },
  },
];

export function describeForModel(): { name: string; description: string; parameters: Record<string, unknown> }[] {
  return registry.map((t) => ({ name: t.id, description: t.description, parameters: t.parameters }));
}

const SCHEMAS: Record<string, unknown> = {
  project_list: { type: "object", properties: { path: { type: "string", description: "Directory, default ''" } } },
  project_read: {
    type: "object",
    properties: { path: { type: "string", description: "File path, e.g. builds/abc/index.html" } },
    required: ["path"],
  },
  project_write: {
    type: "object",
    properties: {
      path: { type: "string", description: "Destination under builds/ or chats/" },
      content: { type: "string", description: "Full file content" },
      message: { type: "string", description: "Commit message" },
    },
    required: ["path", "content"],
  },
  project_create_repo: {
    type: "object",
    properties: {
      name: { type: "string", description: "Repository name, e.g. tic-tac-toe" },
      private: { type: "boolean", description: "true = private, false = public (omit to ask the user)" },
      message: { type: "string", description: "Optional description" },
    },
    required: ["name"],
  },
  project_commit_file: {
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository name in your account" },
      path: { type: "string", description: "File path, e.g. index.html" },
      content: { type: "string", description: "Full file content" },
      message: { type: "string", description: "Commit message" },
    },
    required: ["repo", "path", "content"],
  },
  vercel_project: {
    type: "object",
    properties: { project: { type: "string", description: "Project name or id" } },
    required: ["project"],
  },
  preview_check: {
    type: "object",
    properties: { url: { type: "string", description: "https URL to verify" } },
    required: ["url"],
  },
  project_create_branch: {
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository name in your account" },
      branch: { type: "string", description: "New branch name" },
      base: { type: "string", description: "Base branch (default: repo default)" },
    },
    required: ["repo", "branch"],
  },
  project_open_pr: {
    type: "object",
    properties: {
      repo: { type: "string" },
      head: { type: "string", description: "Source branch" },
      base: { type: "string", description: "Target branch" },
      title: { type: "string" },
      body: { type: "string" },
    },
    required: ["repo", "head", "title"],
  },
  checkpoint_create: {
    type: "object",
    properties: { label: { type: "string", description: "What this checkpoint covers" } },
    required: ["label"],
  },
  checkpoint_restore: {
    type: "object",
    properties: { id: { type: "string", description: "Checkpoint id" } },
    required: ["id"],
  },
  vercel_deploy_status: {
    type: "object",
    properties: { deploymentId: { type: "string", description: "dpl_… id" } },
    required: ["deploymentId"],
  },
  vercel_deploy: {
    type: "object",
    properties: {
      project: { type: "string" },
      files: { type: "array", description: "Small static site files", items: { type: "object" } },
      target: { type: "string", enum: ["production", "preview"] },
      confirm: { type: "boolean", description: "Must be true — user confirmed" },
    },
    required: ["project", "files", "confirm"],
  },
  composio_execute: {
    type: "object",
    properties: {
      tool: { type: "string", description: "Composio tool slug, e.g. GMAIL_SEND_EMAIL" },
      params: { type: "object", description: "Tool arguments" },
      connectedAccountId: { type: "string" },
      confirm: { type: "boolean", description: "Required true for world-changing calls" },
    },
    required: ["tool", "params"],
  },
};

/**
 * Translate normalized Maxxen tools to OpenAI function-calling format
 * (the provider adapter). Pass the runtime-filtered list so the model only
 * ever sees tools that are actually usable in this session.
 */
export function toOpenAITools(defs: ToolDef[] = registry) {
  return defs.map((t) => ({
    type: "function" as const,
    function: {
      name: t.id,
      description: t.description + " (Maxxen permission: " + t.permission + ")",
      parameters: SCHEMAS[t.id] || { type: "object", properties: {} },
    },
  }));
}

export { assertSafeBaseURL };
