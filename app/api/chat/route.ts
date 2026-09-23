import { NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM = `You are Maxxen AI, a multipurpose agentic builder.
- If user asks to build a website/app/component, output: 1) short plan, 2) full code files with paths in \`\`\` blocks, 3) how to run/deploy.
- Be concise but complete. Prefer Next.js + Tailwind.
- If Composio tools/plugins are mentioned, explain which toolkit to connect and what action to take.`;

// Universal BYOK: works with ANY OpenAI-compatible provider.
// Body: { messages, apiKey, baseURL, model } — all supplied by the user.
// - OpenAI:      baseURL https://api.openai.com/v1 (default), key sk-..., model gpt-4o-mini
// - Gemini:      baseURL https://generativelanguage.googleapis.com/v1beta/openai/, key AIza..., model gemini-1.5-flash
// - OpenRouter:  baseURL https://openrouter.ai/api/v1, key sk-or-..., model e.g. anthropic/claude-3.5-sonnet
// - Groq/DeepSeek/Ollama/etc: their OpenAI-compatible base URL + model id.
// No provider is hardcoded. No server-side keys. Ever.
export async function POST(req: Request) {
  try {
    const { messages, apiKey, baseURL, model } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "Missing API key. Add your Base URL + API key + Model ID in /chat (model menu) or /settings." }, { status: 400 });
    if (!Array.isArray(messages) || !messages.length)
      return NextResponse.json({ error: "No messages to send." }, { status: 400 });
    const clean = messages
      .filter((x: any) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .map((x: any) => ({ role: x.role as "user" | "assistant", content: x.content.slice(0, 12000) }));
    if (!clean.length) return NextResponse.json({ error: "No valid messages to send." }, { status: 400 });

    const client = new OpenAI({ apiKey, baseURL: baseURL?.trim() || "https://api.openai.com/v1" });
    const out = await client.chat.completions.create({
      model: model?.trim() || "gpt-4o-mini",
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
