import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { verifySession } from "@/lib/session";
import { SETTINGS_PATH, sealSecrets, sanitizePrefs, type StoredSettings } from "@/lib/vault";

// Saves the calling USER's preferences + encrypted secrets to THEIR OWN
// maxxen-data repo. Pass wipe:true to fully reset (prefs + vault cleared).
// Auth: HMAC session + the user's own GitHub token (used once, never stored).
export async function POST(req: Request) {
  try {
    const { session, githubToken, prefs, secrets, wipe } = await req.json();
    const email = verifySession(String(session || ""));
    if (!email) return NextResponse.json({ error: "Session expired. Log in again." }, { status: 401 });
    if (!githubToken) return NextResponse.json({ error: "Add YOUR GitHub token first (Settings → Storage)." }, { status: 400 });

    const oct = new Octokit({ auth: githubToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    try {
      await oct.rest.repos.get({ owner: me.login, repo });
    } catch (e: any) {
      if (e?.status === 404) {
        try {
          await oct.rest.repos.createForAuthenticatedUser({ name: repo, private: true, description: "Maxxen AI user storage (preferences + encrypted vault)" });
        } catch (c: any) {
          if (c?.status !== 422) throw c;
        }
      } else throw e;
    }

    let sha: string | undefined;
    let prev: StoredSettings | null = null;
    try {
      const cur = await oct.rest.repos.getContent({ owner: me.login, repo, path: SETTINGS_PATH });
      if (!Array.isArray(cur.data) && cur.data.type === "file") {
        sha = cur.data.sha;
        try {
          prev = JSON.parse(Buffer.from((cur.data as any).content, "base64").toString("utf8"));
        } catch {
          prev = null;
        }
      }
    } catch (e: any) {
      if (e?.status !== 404) throw new Error(`Couldn't read settings: ${e?.message || e}`);
    }

    const cleanPrefs = sanitizePrefs(prefs);
    const cleanSecrets: Record<string, string> = {};
    if (secrets && typeof secrets === "object") {
      for (const [k, v] of Object.entries(secrets as Record<string, unknown>)) {
        if (typeof v === "string" && v && v.length < 8000 && /^[a-zA-Z0-9_]+$/.test(k)) cleanSecrets[k] = v;
      }
    }

    const body: StoredSettings = wipe
      ? { updatedAt: new Date().toISOString(), prefs: {}, vault: null }
      : {
          updatedAt: new Date().toISOString(),
          prefs: { ...(prev && typeof prev.prefs === "object" ? prev.prefs : {}), ...cleanPrefs },
          vault: Object.keys(cleanSecrets).length ? sealSecrets(email, cleanSecrets) : null,
        };

    await oct.rest.repos.createOrUpdateFileContents({
      owner: me.login,
      repo,
      path: SETTINGS_PATH,
      message: wipe ? "maxxen: wipe vault" : "maxxen: sync preferences + encrypted vault",
      content: Buffer.from(JSON.stringify(body, null, 2)).toString("base64"),
      sha,
    });
    return NextResponse.json({
      ok: true,
      repo: `${me.login}/${repo}`,
      savedSecrets: !wipe && Object.keys(cleanSecrets).length > 0,
      wiped: !!wipe,
    });
  } catch (e: any) {
    const raw = e.message ?? "Vault save failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — GitHub token invalid; recreate it (repo scope)." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
