import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sessionEmail, signGithubOAuthState } from "@/lib/account-vault";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const email = sessionEmail(req);
  if (!email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const clientId = process.env.GITHUB_APP_CLIENT_ID || "";
  if (!clientId) return NextResponse.json({ error: "GitHub OAuth is not configured yet." }, { status: 500 });
  const nonce = crypto.randomBytes(32).toString("base64url");
  const state = signGithubOAuthState(email, nonce);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", process.env.GITHUB_APP_CALLBACK_URL || new URL("/api/auth/github/callback", req.url).toString());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", crypto.createHash("sha256").update(nonce).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  const response = NextResponse.redirect(url);
  response.cookies.set("maxxen_github_oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}