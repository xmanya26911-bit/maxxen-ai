import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { verifySession } from "@/lib/session";
import { SETTINGS_PATH, openSecrets, type StoredSettings } from "@/lib/vault";

// Loads the calling USER's preferences + decrypts their vault from THEIR OWN
// maxxen-data repo. Same auth contract as save: valid session + matching
// email + the user's own GitHub token (used once, never stored).
export async function POST(req: Request) {
  try {
    const { session, githubToken } = await req.json();
    const email = verifySession(String(session || ""));
    if (!email) return NextResponse.json({ error: "Session expired. Log in again." }, { status: 401 });
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first (Settings → Storage)." }, { status: 400 });

    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    try {
      await oct.rest.repos.get({ owner: me.login, repo });
    } catch {
      return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, prefs: {}, secrets: {}, fresh: true });
    }

    let stored: StoredSettings | null = null;
    try {
      const cur = await oct.rest.repos.getContent({ owner: me.login, repo, path: SETTINGS_PATH });
      if (!Array.isArray(cur.data) && cur.data.type === "file") {
        stored = JSON.parse(Buffer.from((cur.data as any).content, "base64").toString("utf8"));
      }
    } catch {
      stored = null;
    }
    if (!stored) return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, prefs: {}, secrets: {}, fresh: true });

    let secrets: Record<string, string> = {};
    if (stored.vault && typeof stored.vault === "object") {
      try {
        secrets = openSecrets(email, stored.vault);
      } catch {
        return NextResponse.json({ error: "Vault locked — it was sealed in a different session. Re-save from Settings to re-seal." }, { status: 403 });
      }
    }
    const prefs = stored.prefs && typeof stored.prefs === "object" ? stored.prefs : {};
    return NextResponse.json({ ok: true, repo: `${me.login}/${repo}`, prefs, secrets, updatedAt: stored.updatedAt || null });
  } catch (e: any) {
    const raw = e.message ?? "Vault load failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — GitHub token invalid; recreate it (repo scope)." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
