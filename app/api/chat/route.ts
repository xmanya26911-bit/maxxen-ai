import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";
const BASE_SYSTEM = "You are Maxxen AI, a multipurpose agentic builder inside the Maxxen workspace.";
const MODES: Record<string, string> = {
  chat: "Chat freely and helpfully. Be concise.",
  build: "Build a complete, SINGLE-FILE HTML page. Output exactly one html fenced block with the entire page. Before it, a 2-line plan. After it, 2 lines on how to open/deploy it.",
  code: "Answer with code first. Output fenced code blocks labeled with language and path. Keep prose minimal.",
  design: "Act as a product designer + frontend engineer. Output a single html fenced block plus 3 bullet notes.",
  research: "Research carefully: bullets, trade-offs, recommendation. Never invent sources.",
  deploy: "Guide shipping to the user's own Vercel project, plus a pre-deploy checklist.",
  agent: "Work like an engineering collaborator: numbered file operations, narrate steps, finish with summary.",
};
function hintFor(e: any, status?: number): string {
  const raw = String(e?.message || e || "");
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|unauthorized/i.test(raw)) return " — API key rejected. Re-paste the key for that provider.";
  if (status === 404 || /model_not_found|does not exist|invalid model/i.test(raw)) return " — model ID unknown to that provider.";
  if (status === 429 || /rate.?limit|quota|overloaded/i.test(raw)) return " — provider rate limit. Wait or switch models.";
  if (/fetch failed|ENOTFOUND|ECONN|network|timeout/i.test(raw)) return " — can't reach that Base URL. Check it.";
  return "";
}
async function callAnthropic(apiKey: string, baseURL: string, model: string, clean: { role: string; content: string }[]) {
  const r = await fetch(baseURL.replace(/\/$/, "") + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model, max_tokens: 4096, system: BASE_SYSTEM, messages: clean.map((m) => ({ role: m.role, content: m.content })) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: any = new Error(r.status + " " + ((j as any)?.error?.message || "Anthropic request failed"));
    err.status = r.status;
    throw err;
  }
  return Array.isArray((j as any)?.content) ? (j as any).content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : "";
}
export async function POST(req: Request) {
  try {
    const { messages, apiKey, baseURL, model, provider, mode } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "Missing API key. Pick a provider in /chat, paste the key, done." }, { status: 400 });
    if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "No messages to send." }, { status: 400 });
    const clean = sanitizeMessages(messages);
    if (!clean.length) return NextResponse.json({ error: "No valid messages to send." }, { status: 400 });
    const modeKey = typeof mode === "string" && MODES[mode.toLowerCase()] ? mode.toLowerCase() : "chat";
    const system = BASE_SYSTEM + "\n\nMode: " + modeKey.toUpperCase() + "\n" + MODES[modeKey];
    const sized = budgeted(clean);
    const url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
    const mid = (model || "").trim();
    const useAnthropic = provider === "anthropic" || /api\.anthropic\.com/i.test(url);
    if (useAnthropic) {
      const reply = await callAnthropic(apiKey, url, mid || "claude-3-5-haiku-latest", sized);
      if (!reply.trim()) return NextResponse.json({ error: "Model returned an empty response. Retry, or switch models." }, { status: 502 });
      return NextResponse.json({ reply, mode: modeKey });
    }
    const client = new OpenAI({ apiKey, baseURL: url });
    const out = await client.chat.completions.create({ model: mid || "gpt-4o-mini", messages: [{ role: "system", content: system }, ...sized], temperature: 0.7 });
    const reply = out.choices[0]?.message?.content ?? "";
    if (!reply.trim()) return NextResponse.json({ error: "Model returned an empty response. Retry, or switch models." }, { status: 502 });
    return NextResponse.json({ reply, mode: modeKey });
  } catch (e: any) {
    const raw = e.message ?? "Chat failed";
    return NextResponse.json({ error: raw + hintFor(e, e.status) }, { status: 500 });
  }
}