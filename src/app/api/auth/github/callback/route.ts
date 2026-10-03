import { NextResponse } from "next/server";
import { linkGithubToken } from "@/lib/account-vault";
import { serverSecret, verifySession } from "@/lib/session";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "maxxen-github-oauth-state";
const SESSION_COOKIE = "maxxen-github-oauth-session";
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

  const expectedState = readCookie(STATE_COOKIE);
  const sessionToken = readCookie(SESSION_COOKIE);

  if (oauthError) return redirect(req, { github: "error", message: "GitHub authorization was cancelled." });
  if (!code || !state || !expectedState || state.length !== expectedState.length ||
      !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
    return redirect(req, { github: "error", message: "Invalid GitHub OAuth state. Please try again." });
  }

  const email = verifySession(sessionToken);
  if (!email) return redirect(req, { github: "error", message: "Your MAXXEN session expired. Please sign in again." });

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

    await linkGithubToken(email, accessToken, true);

    const res = redirect(req, { github: "connected" });
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch {
    return redirect(req, { github: "error", message: "GitHub connection failed. Please try again." });
  }
}
