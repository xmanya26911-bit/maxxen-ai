import { describe, it, expect } from "vitest";
import { registry, centralPermissionGate, toOpenAITools, type Ctx, type ToolDef } from "@/lib/tools";

// Locks the permission-enforcement invariants (see tools.ts header):
// 1. centralPermissionGate refuses deploy + destructive-external calls at the
//    agent loop's single def.run() site unless a human confirmed that tool.
// 2. The per-tool confirm gates inside run() still hold (defense in depth).
// 3. Every registry entry declares a known permission value.
// All run() assertions below stop BEFORE any network call.

const noConfirm: Ctx = { githubToken: "ghp_fake", vercelToken: "fake", composioKey: "compo_fake" };
const confirmed = (id: string): Ctx => ({ ...noConfirm, confirmedTool: id });

function tool(id: string): ToolDef {
  const def = registry.find((t) => t.id === id);
  if (!def) throw new Error(`missing tool ${id}`);
  return def;
}

describe("centralPermissionGate (agent-loop backstop)", () => {
  it("refuses a deploy tool without a human confirmation", () => {
    const res = centralPermissionGate(tool("vercel_deploy"), { project: "x", files: [] }, noConfirm);
    expect(res).not.toBeNull();
    expect(res!.ok).toBe(false);
    expect(res!.needsConfirm).toBe(true);
  });

  it("lets a deploy tool through once the human confirmed THAT tool id", () => {
    expect(centralPermissionGate(tool("vercel_deploy"), {}, confirmed("vercel_deploy"))).toBeNull();
    // confirming a DIFFERENT tool must not unlock it
    const res = centralPermissionGate(tool("vercel_deploy"), {}, confirmed("project_write"));
    expect(res?.needsConfirm).toBe(true);
  });

  it("refuses destructive Composio calls without confirmation", () => {
    for (const slug of ["GMAIL_SEND_EMAIL", "NOTION_DELETE_PAGE", "SLACK_POST_MESSAGE"]) {
      const res = centralPermissionGate(tool("composio_execute"), { tool: slug, params: {} }, noConfirm);
      expect(res?.needsConfirm, slug).toBe(true);
    }
  });

  it("allows non-destructive Composio calls without confirmation", () => {
    const res = centralPermissionGate(tool("composio_execute"), { tool: "GMAIL_FETCH_EMAILS", params: {} }, noConfirm);
    expect(res).toBeNull();
  });

  it("destructiveness is judged on params too, not just the slug", () => {
    const res = centralPermissionGate(
      tool("composio_execute"),
      { tool: "SHEETS_GET_ROWS", params: { operation: "delete", range: "A1:B2" } },
      noConfirm
    );
    expect(res?.needsConfirm).toBe(true);
  });

  it("passes read and write tools through (path allowlist + per-tool gates own them)", () => {
    expect(centralPermissionGate(tool("project_read"), { path: "builds/x.js" }, noConfirm)).toBeNull();
    expect(centralPermissionGate(tool("project_write"), { path: "builds/x.js", content: "x" }, noConfirm)).toBeNull();
    expect(centralPermissionGate(tool("web_search"), { query: "x" }, noConfirm)).toBeNull();
  });
});

describe("per-tool confirm gates (defense in depth, network-free)", () => {
  it("vercel_deploy asks for confirmation before touching Vercel", async () => {
    const res = await tool("vercel_deploy").run({ project: "x", files: [{ file: "a.html", data: "b" }] }, noConfirm);
    expect(res.needsConfirm).toBe(true);
    expect(res.ok).toBe(false);
  });

  it("composio_execute refuses a destructive slug before executing", async () => {
    const res = await tool("composio_execute").run({ tool: "GMAIL_SEND_EMAIL", params: { to: "a@b.c" } }, noConfirm);
    expect(res.needsConfirm).toBe(true);
  });

  it("project_create_repo asks before creating", async () => {
    const res = await tool("project_create_repo").run({ name: "demo-app", private: false }, noConfirm);
    expect(res.needsConfirm).toBe(true);
  });

  it("project_open_pr asks before opening", async () => {
    const res = await tool("project_open_pr").run({ repo: "demo", head: "feat", title: "Add thing" }, noConfirm);
    expect(res.needsConfirm).toBe(true);
  });

  it("memory_save asks before persisting", async () => {
    const res = await tool("memory_save").run({ content: "the user prefers dark mode" }, noConfirm);
    expect(res.needsConfirm).toBe(true);
  });
});

describe("registry invariants", () => {
  it("every tool declares a known permission", () => {
    const allowed = new Set(["read", "write", "deploy", "external"]);
    expect(registry.length).toBeGreaterThan(10);
    for (const t of registry) expect(allowed.has(t.permission), `${t.id}: ${t.permission}`).toBe(true);
  });

  it("permission stays visible to the model (advisory context, not a lie)", () => {
    const out = toOpenAITools([tool("vercel_deploy")]);
    expect(out[0].function.description).toContain("Maxxen permission: deploy");
  });

  it("only vercel_deploy is permission:deploy (the central gate applies to it)", () => {
    const deploys = registry.filter((t) => t.permission === "deploy").map((t) => t.id);
    expect(deploys).toEqual(["vercel_deploy"]);
  });
});
