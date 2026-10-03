import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { verifySession } from "@/lib/session";
import { getGithubTokenCookie } from "@/lib/github-token-cookie";
import { SETTINGS_PATH, openSecrets, sealSecrets, sanitizePrefs, type StoredSettings } from "@/lib/vault";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: Request) {
  try {
    const { session, prefs, secrets, deletePrefs, deleteSecrets, wipe } = await req.json();
    const email = verifySession(String(session || ""));
    if (!email) return NextResponse.json({ error: "Session expired. Log in again." }, { status: 401 });
    const resolvedToken = getGithubTokenCookie(req);
    if (!resolvedToken) return NextResponse.json({ error: "Connect GitHub to this MAXXEN account first." }, { status: 401 });

    const oct = new Octokit({ auth: resolvedToken });
    const { data: me } = await oct.rest.users.getAuthenticated();
    const repo = "maxxen-data";
    try {
      await oct.rest.repos.get({ owner: me.login, repo });
    } catch {
      await oct.rest.repos.createForAuthenticatedUser({
        name: repo, private: true, description: "Maxxen AI user storage (preferences + encrypted vault)",
      });
    }

    const cleanPrefs = sanitizePrefs(prefs);
    const cleanSecrets: Record<string, string> = {};
    if (secrets && typeof secrets === "object") {
      for (const [k, v] of Object.entries(secrets as Record<string, unknown>)) {
        if (k !== "githubToken" && typeof v === "string" && v && v.length < 8000 && /^[a-zA-Z0-9_]+$/.test(k)) cleanSecrets[k] = v;
      }
    }
    const removedPrefs = Array.isArray(deletePrefs) ? deletePrefs.filter((x: unknown) => typeof x === "string") : [];
    const removedSecrets = Array.isArray(deleteSecrets) ? deleteSecrets.filter((x: unknown) => typeof x === "string") : [];

    for (let attempt = 0; attempt < 3; attempt++) {
      let sha: string | undefined;
      let prev: StoredSettings | null = null;
      try {
        const cur = await oct.rest.repos.getContent({ owner: me.login, repo, path: SETTINGS_PATH });
        if (!Array.isArray(cur.data) && cur.data.type === "file") {
          sha = cur.data.sha;
          try { prev = JSON.parse(Buffer.from((cur.data as any).content, "base64").toString("utf8")); } catch {}
        }
      } catch {}

      if (wipe) {
        const body: StoredSettings = { updatedAt: new Date().toISOString(), prefs: {}, vault: null };
        try {
          await oct.rest.repos.createOrUpdateFileContents({
            owner: me.login, repo, path: SETTINGS_PATH, message: "maxxen: wipe synced data",
            content: Buffer.from(JSON.stringify(body, null, 2)).toString("base64"), ...(sha ? { sha } : {}),
          });
          return NextResponse.json({ ok: true, repo: me.login + "/" + repo, savedSecrets: false, wiped: true });
        } catch (e: any) {
          if (e?.status === 409 && attempt < 2) { await sleep(120 * (attempt + 1)); continue; }
          throw e;
        }
      }

      let mergedSecrets: Record<string, string> = {};
      if (prev?.vault) {
        try { mergedSecrets = openSecrets(email, prev.vault); } catch { mergedSecrets = {}; }
      }
      Object.assign(mergedSecrets, cleanSecrets);
      for (const key of removedSecrets) delete mergedSecrets[key];

      const mergedPrefs: Record<string, string> = {
        ...(prev?.prefs && typeof prev.prefs === "object" ? prev.prefs : {}),
        ...cleanPrefs,
      };
      for (const key of removedPrefs) delete mergedPrefs[key];

      const body: StoredSettings = {
        updatedAt: new Date().toISOString(),
        prefs: mergedPrefs,
        vault: Object.keys(mergedSecrets).length ? sealSecrets(email, mergedSecrets) : null,
      };

      try {
        await oct.rest.repos.createOrUpdateFileContents({
          owner: me.login, repo, path: SETTINGS_PATH,
          message: "maxxen: sync preferences + encrypted vault",
          content: Buffer.from(JSON.stringify(body, null, 2)).toString("base64"),
          ...(sha ? { sha } : {}),
        });
        return NextResponse.json({
          ok: true, repo: me.login + "/" + repo,
          savedSecrets: Object.keys(cleanSecrets).length > 0, updatedAt: body.updatedAt,
        });
      } catch (e: any) {
        if (e?.status === 409 && attempt < 2) { await sleep(120 * (attempt + 1)); continue; }
        throw e;
      }
    }
    throw new Error("GitHub sync conflicted repeatedly. Please retry.");
  } catch (e: any) {
    const raw = e.message ?? "Vault save failed";
    const hint = /401|Bad credentials/i.test(raw) ? " — GitHub token invalid; reconnect GitHub." : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
