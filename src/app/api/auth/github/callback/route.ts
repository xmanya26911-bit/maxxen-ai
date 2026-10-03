import { NextResponse } from "next/server";
import { setGithubTokenCookie } from "@/lib/github-token-cookie";
import { verifySession } from "@/lib/session";
import crypto from "node:crypto";
import { serverSecret } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSACTION_COOKIE = "maxxen-github-oauth-tx";
const TARGET_REPO = "maxxen-data";

function publicOrigin(req: Request): string {
  return process.env.MAXXEN_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

function redirect(req: Request, params?: Record<string, string>): NextResponse {
  const url = new URL("/settings/integrations", publicOrigin(req));
  url.searchParams.set("github", params?.github || "error");
  if (params?.message) url.searchParams.set("message", params.message);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code") || "";
  const state = requestUrl.searchParams.get("state") || "";
  const oauthError = requestUrl.searchParams.get("error");

  const cookies = req.headers.get("cookie") || "";
  const readCookie = (name: string) => {
    const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  };

  const transaction = readCookie(TRANSACTION_COOKIE);
  let email = "";
  let expectedState = "";
  try {
    const raw = Buffer.from(transaction, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 4) throw new Error("invalid transaction");
    const txEmail = parts[0];
    const exp = parts[1];
    const txState = parts[2];
    const sig = parts[3];
    const payload = txEmail + "|" + exp + "|" + txState;
    const expectedSig = crypto.createHmac("sha256", serverSecret()).update(payload).digest("hex");
    if (expectedSig.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) throw new Error("invalid signature");
    if (!txEmail || !txState || !Number.isFinite(Number(exp)) || Date.now() > Number(exp)) throw new Error("expired transaction");
    email = txEmail;
    expectedState = txState;
  } catch {
    return redirect(req, { github: "error", message: "Your GitHub OAuth session expired. Please start the connection again." });
  }

  if (oauthError) return redirect(req, { github: "error", message: "GitHub authorization was cancelled." });
  if (!code || !state || !expectedState || state.length !== expectedState.length ||
      !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
    return redirect(req, { github: "error", message: "Invalid GitHub OAuth state. Please try again." });
  }
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return redirect(req, { github: "error", message: "GitHub OAuth isn't configured on this deployment." });
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${publicOrigin(req)}/api/auth/github/callback`,
      }),
    });
    const token = await tokenResponse.json().catch(() => ({}));
    const accessToken = typeof token?.access_token === "string" ? token.access_token : "";
    if (!tokenResponse.ok || !accessToken) {
      return redirect(req, { github: "error", message: "GitHub token exchange failed. Please try again." });
    }

    const grantedScopes = String(token?.scope || tokenResponse.headers.get("X-OAuth-Scopes") || "")
      .split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!grantedScopes.includes("repo")) {
      return redirect(req, { github: "error", message: "GitHub did not grant private-repository access. Re-authorize MAXXEN with repository access enabled." });
    }

    const meResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const me = await meResponse.json().catch(() => ({}));
    const login = typeof me?.login === "string" ? me.login : "";
    if (!meResponse.ok || !login) {
      return redirect(req, { github: "error", message: "GitHub identity verification failed." });
    }

    const repoResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(login)}/${TARGET_REPO}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    const repo = await repoResponse.json().catch(() => ({}));

    if (!repoResponse.ok || repo?.private !== true) {
      return redirect(req, {
        github: "error",
        message: `GitHub account @${login} does not have the private ${TARGET_REPO} repo.`,
      });
    }

    if (repo?.permissions?.push !== true) {
      return redirect(req, {
        github: "error",
        message: `GitHub account @${login} can access ${TARGET_REPO}, but cannot write to it.`,
      });
    }

    const res = redirect(req, { github: "connected" });
    setGithubTokenCookie(res, accessToken);
    res.cookies.delete(TRANSACTION_COOKIE);
    return res;
  } catch {
    return redirect(req, { github: "error", message: "GitHub connection failed. Please try again." });
  }
}
