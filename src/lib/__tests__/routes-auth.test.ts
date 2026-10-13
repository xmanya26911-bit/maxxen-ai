import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { signSession } from "@/lib/session";
import { SESSION_ENFORCED } from "@/lib/security/guard";
import { POST as chatPOST } from "@/app/api/chat/route";
import { POST as agentPOST } from "@/app/api/agent/run/route";
import { POST as composioExecutePOST } from "@/app/api/composio/execute/route";
import { POST as composioToolsPOST } from "@/app/api/composio/tools/route";
import { POST as composioConnectPOST } from "@/app/api/composio/connect/route";
import { POST as vercelDeployPOST } from "@/app/api/vercel/deploy/route";
import { POST as vercelStatusPOST } from "@/app/api/vercel/status/route";
import { POST as githubSavePOST } from "@/app/api/github/save/route";

// Route-level session enforcement (regression guard for the M1 fix: these
// routes previously ran without hasValidSession). Every credential-bearing
// route must 401 on missing/forged sessions BEFORE any provider call, and a
// valid session must pass the guard (then fail on its own input validation).
//
// All cases are network-free: valid-session cases stop at input validation
// (400), or for github/save at "no GitHub identity" (401 with its own message).

const EMAIL = "route-test@example.com";
const VALID_SESSION = signSession(EMAIL);
const SESSION_MSG = "Session required.";

function makeReq(path: string, body: unknown, opts?: { header?: string; inBody?: boolean }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.header) headers["x-maxxen-session"] = opts.header;
  const payload = opts?.inBody ? { ...(body as object), session: VALID_SESSION } : body;
  return new Request(`http://localhost${path}`, { method: "POST", headers, body: JSON.stringify(payload) });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({}));
}

type RouteCase = {
  name: string;
  path: string;
  post: (req: Request) => Promise<Response>;
  // Error text an unauthenticated caller gets (github/save resolves its token
  // via resolveGithubToken, which answers with its own message).
  unauthError?: string;
  // Base request body. github/save carries a forged token so the test proves
  // the SESSION check rejects it — not the missing-token check.
  body?: Record<string, unknown>;
  // Body used for the valid-session case; github/save drops the forged token
  // here so an authenticated caller never reaches the GitHub API in tests.
  authedBody?: Record<string, unknown>;
};

const routes: RouteCase[] = [
  { name: "POST /api/chat", path: "/api/chat", post: chatPOST },
  { name: "POST /api/agent/run", path: "/api/agent/run", post: agentPOST },
  { name: "POST /api/composio/execute", path: "/api/composio/execute", post: composioExecutePOST },
  { name: "POST /api/composio/tools", path: "/api/composio/tools", post: composioToolsPOST },
  { name: "POST /api/composio/connect", path: "/api/composio/connect", post: composioConnectPOST },
  { name: "POST /api/vercel/deploy", path: "/api/vercel/deploy", post: vercelDeployPOST },
  { name: "POST /api/vercel/status", path: "/api/vercel/status", post: vercelStatusPOST },
  { name: "POST /api/github/save", path: "/api/github/save", post: githubSavePOST, unauthError: "Connect GitHub to this MAXXEN account first.", body: { githubToken: "ghp_forged-token", path: "settings.json", content: {} }, authedBody: { path: "settings.json", content: {} } },
];

// Keep /api/composio/connect on the caller's own validation path: with the
// server-side fallback env removed, an authenticated call must 400 rather
// than reach Composio.
let savedComposioEnv: string | undefined;
beforeAll(() => {
  savedComposioEnv = process.env.COMPOSIO_API_KEY;
  delete process.env.COMPOSIO_API_KEY;
});
afterAll(() => {
  if (savedComposioEnv === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = savedComposioEnv;
});

describe("route-level session enforcement", () => {
  it("SESSION_ENFORCED is on (guards are live, not decorative)", () => {
    expect(SESSION_ENFORCED).toBe(true);
  });

  for (const r of routes) {
    const unauthError = r.unauthError ?? SESSION_MSG;
    it(`${r.name}: 401 with no session`, async () => {
      const res = await r.post(makeReq(r.path, r.body ?? {}));
      expect(res.status).toBe(401);
      expect((await json(res)).error).toBe(unauthError);
    });

    it(`${r.name}: 401 with a forged session`, async () => {
      const res = await r.post(makeReq(r.path, r.body ?? {}, { header: "forged.not-a-real-token" }));
      expect(res.status).toBe(401);
      expect((await json(res)).error).toBe(unauthError);
    });

    it(`${r.name}: valid session passes the guard`, async () => {
      const res = await r.post(makeReq(r.path, r.authedBody ?? r.body ?? {}, { header: VALID_SESSION }));
      const j = await json(res);
      // The guard must not be what stops an authenticated call: either a
      // non-401, or (github/save) a 401 from a DIFFERENT check with its own
      // message — never "Session required."
      expect(`${res.status}:${String(j.error ?? "")}`).not.toBe(`401:${SESSION_MSG}`);
    });
  }

  it("POST /api/chat: accepts body.session transport as well as the header", async () => {
    const res = await chatPOST(makeReq("/api/chat", {}, { inBody: true }));
    const j = await json(res);
    expect(`${res.status}:${String(j.error ?? "")}`).not.toBe(`401:${SESSION_MSG}`);
    // authenticated but key-less → input validation, not auth
    expect(res.status).toBe(400);
  });

  it("POST /api/github/save: authenticated caller without GitHub identity gets the GitHub 401 message", async () => {
    const res = await githubSavePOST(makeReq("/api/github/save", { path: "settings.json", content: {} }, { header: VALID_SESSION }));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/Connect GitHub/);
  });
});
