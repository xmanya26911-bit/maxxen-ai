import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";

const BASE_SYSTEM = `You are Maxxen AI, a multipurpose agentic builder inside the Maxxen workspace.`;

// Modes make the tool-strip real: the selected mode changes the system
// instruction, therefore the model request. "Agent" mode narrates concrete
// file operations instead of pretending to execute them.
const MODES: Record<string, string> = {
  chat: `Chat freely and helpfully. Be concise.`,
  build: `Build a complete, SINGLE-FILE HTML page. Output exactly one \`\`\`html block containing the entire page (inline CSS+JS, no external build step). Before it, give a 2-line plan. After it, 2 lines on how to open/deploy it. Do not output multiple files.`,
  code: `Answer with code first. Output fenced code blocks, each labeled with language and path like \`\`\`tsx:components/Button.tsx. Keep prose minimal — short plan, then code, then how to run.`,
  design: `Act as a product designer + frontend engineer. Prioritize typography, spacing, hierarchy and restraint. Output a single \`\`\`html block with the design implemented, plus 3 bullet notes on the design decisions.`,
  research: `Research carefully and show your work: key findings as bullets, trade-offs, and a recommendation. Cite what you checked. Never invent sources, versions or APIs — say when unsure.`,
  deploy: `Guide shipping: explain the exact deploy steps for the user's own Vercel project (import repo, env vars, deploy), plus a pre-deploy checklist (build passes, env set, domains). If they paste an error, diagnose it precisely.`,
  agent: `Work like an engineering collaborator: break the task into numbered file operations (inspect/create/update), narrate each step as you go ("1. Inspecting project structure…", "2. Updating X…"), and finish with a summary of what changed and what to verify. You cannot run commands yourself — be explicit about that and give exact commands for the user.`,
};

// Crude but real context budget: ~48k chars total (system + head + tail).
const MAX_TOTAL_CHARS = 48000;
const MAX_MSG_CHARS = 12000;

function budgeted(clean: { role: "user" | "assistant"; content: string }[]) {
  const sized = clean.map((m) => ({ ...m, content: m.content.slice(0, MAX_MSG_CHARS) }));
  let total = sized.reduce((n, m) => n + m.content.length, 0);
  if (total <= MAX_TOTAL_CHARS) return sized;
  const first = sized[0];
  const tail: typeof sized = [];
  let keep = MAX_TOTAL_CHARS - Math.min(first.content.length, 6000);
  for (let i = sized.length - 1; i >= 1 && keep > 0; i--) {
    tail.unshift(sized[i]);
    keep -= sized[i].content.length;
  }
  return [first, ...tail];
}

function hintFor(e: any, status?: number): string {
  const raw = String(e?.message || e || "");
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|unauthorized|invalid_api_key|authentication_error/i.test(raw))
    return " — API key rejected. Re-paste the key for that provider.";
  if (status === 404 || /model_not_found|does not exist|invalid model|not_found/i.test(raw))
    return " — model ID unknown to that provider. Check the exact ID.";
  if (status === 429 || /rate.?limit|quota|overloaded/i.test(raw))
    return " — provider rate limit. Wait a bit or switch models.";
  if (/fetch failed|ENOTFOUND|ECONN|network|timeout/i.test(raw)) return " — can't reach that Base URL. Check it.";
  return "";
}

const ANTHROPIC_DEFAULT = "https://api.anthropic.com";

async function callAnthropic(apiKey: string, baseURL: string, model: string, clean: { role: string; content: string }[]) {
  const r = await fetch(`${baseURL.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 4096, system: BASE_SYSTEM, messages: clean.map((m) => ({ role: m.role, content: m.content })) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: any = new Error(`${r.status} ${(j as any)?.error?.message || "Anthropic request failed"}`);
    err.status = r.status;
    throw err;
  }
  return Array.isArray((j as any)?.content)
    ? (j as any).content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n")
    : "";
}

export async function POST(req: Request) {
  try {
    const { messages, apiKey, baseURL, model, provider, mode } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "Missing API key. Pick ChatGPT, Claude or Gemini in /chat (model menu) or /settings, paste the key, done." }, { status: 400 });
    if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "No messages to send." }, { status: 400 });
    const clean = messages
      .filter((x: any) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .map((x: any) => ({ role: x.role as "user" | "assistant", content: x.content }));
    if (!clean.length) return NextResponse.json({ error: "No valid messages to send." }, { status: 400 });

    const modeKey = typeof mode === "string" && MODES[mode.toLowerCase()] ? mode.toLowerCase() : "chat";
    const system = `${BASE_SYSTEM}\n\nMode: ${modeKey.toUpperCase()}\n${MODES[modeKey]}`;
    const sized = budgeted(clean);

    const url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
    const mid = (model || "").trim();
    const useAnthropic = provider === "anthropic" || /api\.anthropic\.com/i.test(url);
    if (useAnthropic) {
      const reply = await callAnthropic(apiKey, url || ANTHROPIC_DEFAULT, mid || "claude-3-5-haiku-latest", sized);
      if (!reply.trim()) return NextResponse.json({ error: "Model returned an empty response. Retry, or switch models." }, { status: 502 });
      return NextResponse.json({ reply, mode: modeKey });
    }

    const client = new OpenAI({ apiKey, baseURL: url });
    const out = await client.chat.completions.create({
      model: mid || "gpt-4o-mini",
      messages: [{ role: "system", content: system }, ...sized],
      temperature: 0.7,
    });
    const reply = out.choices[0]?.message?.content ?? "";
    if (!reply.trim()) return NextResponse.json({ error: "Model returned an empty response. Retry, or switch models." }, { status: 502 });
    return NextResponse.json({ reply, mode: modeKey });
  } catch (e: any) {
    const raw = e.message ?? "Chat failed";
    return NextResponse.json({ error: raw + hintFor(e, e.status) }, { status: 500 });
  }
}
