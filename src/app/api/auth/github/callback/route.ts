import { NextResponse } from "next/server";
import { getLinkedGithubOAuth, linkGithubOAuth, verifyGithubOAuthState } from "@/lib/account-vault";
import { Octokit } from "octokit";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const returnedError = url.searchParams.get("error");
  const cookie = req.headers.get("cookie") || "";
  const nonce = cookie.match(/(?:^|;\\s*)maxxen_github_oauth_nonce=([^;]+)/)?.[1];
  if (returnedError) return NextResponse.redirect(new URL("/settings?github=denied", url.origin));
  if (!code || !state) return NextResponse.redirect(new URL("/settings?github=failed", url.origin));
  const parsed = verifyGithubOAuthState(state);
  if (!parsed || !nonce || nonce !== parsed.nonce) return NextResponse.redirect(new URL("/settings?github=failed", url.origin));
  const clientId = process.env.GITHUB_APP_CLIENT_ID || "";
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL("/settings?github=not_configured", url.origin));
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: process.env.GITHUB_APP_CALLBACK_URL || new URL("/api/auth/github/callback", url.origin).toString(), code_verifier: parsed.nonce }) });
    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || typeof token.access_token !== "string") throw new Error("GitHub token exchange failed.");
    const oct = new Octokit({ auth: token.access_token });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const existing = await getLinkedGithubOAuth(parsed.email);
    await linkGithubOAuth(parsed.email, { accessToken: token.access_token, refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : existing?.refreshToken || undefined, accessExpiresAt: typeof token.expires_in === "number" ? Date.now() + token.expires_in * 1000 : undefined, githubId: me.id, login: me.login });
    const response = NextResponse.redirect(new URL("/settings?github=connected", url.origin));
    response.cookies.set("maxxen_github_oauth_nonce", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch { return NextResponse.redirect(new URL("/settings?github=failed", url.origin)); }
}