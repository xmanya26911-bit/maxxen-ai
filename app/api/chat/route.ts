import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM = `You are Maxxen AI, a multipurpose agentic builder.
- If user asks to build a website/app/component, output: 1) short plan, 2) full code files with paths in \`\`\` blocks, 3) how to run/deploy.
- Be concise but complete. Prefer Next.js + Tailwind.
- If Composio tools/plugins are mentioned, explain which toolkit to connect and what action to take.`;

export async function POST(req: Request) {
  try {
    const { messages, provider, apiKey, baseURL, model } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "Missing BYOK apiKey. Paste Gemini or OpenAI key in Settings." }, { status: 400 });
    if (provider === "gemini") {
      const gen = new GoogleGenerativeAI(apiKey);
      const m = gen.getGenerativeModel({ model: model || "gemini-1.5-flash" });
      const history = (messages ?? []).map((x: any) => `${x.role}: ${x.content}`).join("\n");
      const out = await m.generateContent(`${SYSTEM}\n\n${history}`);
      return NextResponse.json({ reply: out.response.text() });
    }
    const client = new OpenAI({ apiKey, baseURL: baseURL || undefined });
    const out = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM }, ...(messages ?? [])],
      temperature: 0.7,
    });
    return NextResponse.json({ reply: out.choices[0]?.message?.content ?? "" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Chat failed" }, { status: 500 });
  }
}
