import { NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM = `You are Maxxen AI, a multipurpose agentic builder.
- If user asks to build a website/app/component, output: 1) short plan, 2) full code files with paths in \`\`\` blocks, 3) how to run/deploy.
- Be concise but complete. Prefer Next.js + Tailwind.
- If Composio tools/plugins are mentioned, explain which toolkit to connect and what action to take.`;

// Providers: user picks ChatGPT / Claude / Gemini / Custom in one tap.
// Only TWO wire protocols exist underneath:
// - "anthropic": Anthropic Messages API (Claude has no OpenAI-compatible endpoint).
// - everything else: OpenAI-compatible chat completions (OpenAI, Gemini's
//   OpenAI-compatible URL, OpenRouter, Groq, DeepSeek, Ollama, …).
// Body: { messages, apiKey, baseURL, model, provider? } — all user-supplied.
// No server-side keys. Ever.
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
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: clean.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${(j as any)?.error?.message || "Anthropic request failed"}`);
  const text = Array.isArray((j as any)?.content)
    ? (j as any).content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n")
    : "";
  return text;
}

export async function POST(req: Request) {
  try {
    const { messages, apiKey, baseURL, model, provider } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "Missing API key. Pick ChatGPT, Claude or Gemini in /chat (model menu) or /settings, paste the key, done." }, { status: 400 });
    if (!Array.isArray(messages) || !messages.length)
      return NextResponse.json({ error: "No messages to send." }, { status: 400 });
    const clean = messages
      .filter((x: any) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .map((x: any) => ({ role: x.role as "user" | "assistant", content: x.content.slice(0, 12000) }));
    if (!clean.length) return NextResponse.json({ error: "No valid messages to send." }, { status: 400 });

    const url = (baseURL || "").trim();
    const mid = (model || "").trim();
    const useAnthropic = provider === "anthropic" || /api\.anthropic\.com/i.test(url);
    if (useAnthropic) {
      const reply = await callAnthropic(apiKey, url || ANTHROPIC_DEFAULT, mid || "claude-3-5-haiku-latest", clean);
      return NextResponse.json({ reply });
    }

    const client = new OpenAI({ apiKey, baseURL: url || "https://api.openai.com/v1" });
    const out = await client.chat.completions.create({
      model: mid || "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM }, ...clean],
      temperature: 0.7,
    });
    return NextResponse.json({ reply: out.choices[0]?.message?.content ?? "" });
  } catch (e: any) {
    const raw = e.message ?? "Chat failed";
    const hint = /401|auth|key/i.test(raw)
      ? " — check your API key."
      : /404|model/i.test(raw)
        ? " — check the Model ID for your provider."
        : /fetch|ENOTFOUND|ECONN|base/i.test(raw)
          ? " — check the Base URL."
          : "";
    return NextResponse.json({ error: raw + hint }, { status: 500 });
  }
}
