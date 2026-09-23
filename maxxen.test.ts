import { assertSafeBaseURL } from "./lib/net-guard";
import { signSession, verifySession } from "./lib/session";
import { sealSecrets, openSecrets, sanitizePrefs } from "./lib/vault";
import { budgeted, sanitizeMessages } from "./lib/context";

process.env.GMAIL_APP_PASSWORD = "test-server-secret";
let pass = 0;
let fail = 0;
const t = (name: string, cond: boolean) => {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("FAIL:", name);
  }
};
const throws = (fn: () => void) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// net-guard
t("https ok", assertSafeBaseURL("https://api.openai.com/v1", "") === "https://api.openai.com/v1");
t("trailing slash trimmed", assertSafeBaseURL("https://x.com/a/", "") === "https://x.com/a");
t("fallback", assertSafeBaseURL("", "https://api.openai.com/v1") === "https://api.openai.com/v1");
t("reject http", throws(() => assertSafeBaseURL("http://x.com", "")));
t("reject localhost", throws(() => assertSafeBaseURL("https://localhost:3000", "")));
t("reject 127", throws(() => assertSafeBaseURL("https://127.0.0.1/", "")));
t("reject 10/8", throws(() => assertSafeBaseURL("https://10.1.2.3/", "")));
t("reject 192.168", throws(() => assertSafeBaseURL("https://192.168.1.1/", "")));
t("reject 172.16", throws(() => assertSafeBaseURL("https://172.16.0.1/", "")));
t("reject link-local", throws(() => assertSafeBaseURL("https://169.254.169.254/", "")));
t("reject metadata", throws(() => assertSafeBaseURL("https://metadata.google.internal/", "")));
t("reject .local", throws(() => assertSafeBaseURL("https://printer.local/", "")));
t("reject creds in url", throws(() => assertSafeBaseURL("https://u:p@x.com/", "")));
t("reject garbage", throws(() => assertSafeBaseURL("not a url", "")));
t("public ip ok", assertSafeBaseURL("https://8.8.8.8/v1", "") === "https://8.8.8.8/v1");

// session
const tok = signSession("User@Mail.com");
t("session verifies lowercase", verifySession(tok) === "user@mail.com");
t("forged rejected", verifySession(tok.slice(0, -2) + "xx") === null);
t("empty rejected", verifySession("") === null);
t("expired rejected", verifySession(tok) !== null && (() => {
  const short = signSession("a@b.c", -1000);
  return verifySession(short) === null;
})());

// vault
const secrets = { maxxen_apikey: "sk-x", maxxen_github_token: "ghp-y" };
const pkt = sealSecrets("user@mail.com", secrets);
t("vault roundtrip", JSON.stringify(openSecrets("user@mail.com", pkt)) === JSON.stringify(secrets));
t("vault wrong email", (() => { try { openSecrets("other@mail.com", pkt); return false; } catch { return true; } })());
t("vault tamper", (() => {
  const bad = { ...pkt, data: pkt.data.slice(0, 10) + (pkt.data[10] === "A" ? "B" : "A") + pkt.data.slice(11) };
  try { openSecrets("user@mail.com", bad); return false; } catch { return true; }
})());
t("prefs cleaned", JSON.stringify(sanitizePrefs({ a: "b", "../../x": "evil", n: 1 })) === JSON.stringify({ a: "b" }));

// context
t("sanitize drops junk", sanitizeMessages([{ role: "user", content: "hi" }, { role: "nope", content: "x" }, null] as any).length === 1);
const big = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(12000) }));
const b = budgeted(big as any);
const total = b.reduce((n, m) => n + m.content.length, 0);
t("budget caps total", total <= 48000 + 12000 && b.length < big.length);
t("budget keeps head", b[0].content.length === 12000 - 0 && b.length >= 2);
t("budget passthrough small", budgeted([{ role: "user", content: "hi" }]).length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
