import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { serverSecret, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSACTION_COOKIE = "maxxen-github-oauth-tx";
const STATE_TTL_SECONDS = 10 * 60;

function publicOrigin(req: Request): string {
  return process.env.MAXXEN_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

export async function GET(req: Request) {
  const sessionToken =
    req.headers.get("x-maxxen-session") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!verifySession(sessionToken)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID || "";
  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth isn't configured on this deployment yet." }, { status: 500 });
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const email = verifySession(sessionToken)!;
  const exp = Date.now() + STATE_TTL_SECONDS * 1000;
  const payload = `${email}|${exp}|${state}`;
  const sig = crypto.createHmac("sha256", serverSecret()).update(payload).digest("hex");
  const transaction = Buffer.from(`${payload}|${sig}`).toString("base64url");
  const redirectUri = `${publicOrigin(req)}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo",
    state,
  });

  const res = NextResponse.json({
    ok: true,
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
  });

  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(TRANSACTION_COOKIE, transaction, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });

  return res;
}
