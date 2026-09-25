import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";
import { registry, toOpenAITools, type Ctx } from "@/lib/tools";
const MAX_STEPS = 6;
const AGENT_SYSTEM = "You are Maxxen, an engineering agent inside the user's own workspace. Think step by step, then ACT with tools. Prefer inspecting before changing anything. Batch independent reads in one block. For deploys: vercel_deploy REQUIRES the user to confirm first — if confirm is missing, explain what you WOULD deploy and stop. Final answer: what changed, file paths, how to verify.";
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { messages, apiKey, baseURL, model, provider, githubToken, vercelToken, composioKey, maxSteps } = body;
  if (!apiKey) return NextResponse.json({ error: "Missing API key." }, { status: 400 });
  if (provider === "anthropic" || /api\.anthropic\.com/i.test(String(baseURL || ""))) return NextResponse.json({ error: "Agent loop needs an OpenAI-compatible endpoint. Use Claude in normal chat instead." }, { status: 400 });
  if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "No messages." }, { status: 400 });
  let url: string;
  try {
    url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  const mid = ((model || "") as string).trim() || "gpt-4o-mini";
  const steps = Math.min(Math.max(Number(maxSteps) || MAX_STEPS, 1), 10);
  const userConfirmed = Array.isArray(messages) && messages.some((m: any) => m?.role === "user" && typeof m?.content === "string" && m.content.startsWith("Confirmed:"));
  const ctx: Ctx = { githubToken, vercelToken, composioKey, userConfirmed };
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(new TextEncoder().encode("data: " + JSON.stringify(obj) + "\n\n"));
      const activity = (text: string, phase = "tool", tool?: string) => send({ activity: { phase, text, tool } });
      const fail = (message: string) => {
        send({ activity: { phase: "error", text: message } });
        send({ error: message });
        controller.close();
      };
      try {
        const client = new OpenAI({ apiKey, baseURL: url });
        const history: any[] = [{ role: "system", content: AGENT_SYSTEM }, ...budgeted(sanitizeMessages(messages))];
        activity("Planning", "planning");
        for (let step = 0; step < steps; step++) {
          let out: any;
          try {
            out = await client.chat.completions.create({ model: mid, messages: history, temperature: 0.3, tools: toOpenAITools() as any, tool_choice: "auto" as any });
          } catch (e: any) {
            fail(e?.message || "Model call failed.");
            return;
          }
          const choice = out.choices[0]?.message;
          const calls = (choice as any)?.tool_calls || [];
          const text = choice?.content || "";
          if (!calls.length) {
            if (!text.trim()) {
              fail("Model returned nothing. Retry, or switch models.");
              return;
            }
            for (const ch of text) send({ delta: ch });
            send({ done: true });
            controller.close();
            return;
          }
          history.push({ role: "assistant", content: text || null, tool_calls: calls });
          for (const call of calls) {
            const def = registry.find((t) => t.id === call.function?.name);
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function?.arguments || "{}");
            } catch {
              history.push({ role: "tool", tool_call_id: call.id, content: "Invalid tool arguments JSON." });
              activity("Skipped malformed args");
              continue;
            }
            if ("confirm" in args) delete (args as any).confirm;
            if (!def) {
              history.push({ role: "tool", tool_call_id: call.id, content: "Unknown tool — skipped." });
              activity("Skipped unknown tool");
              continue;
            }
            activity(def.id, "tool", def.id);
            let res;
            try {
              res = await def.run(args, ctx);
            } catch (e: any) {
              res = { ok: false as const, summary: e?.message || "Tool crashed." };
            }
            activity((res.ok ? "done " : "failed ") + res.summary, res.ok ? "tool" : "error", def.id);
            if (!res.ok && (res as any).needsConfirm) send({ needsConfirm: true, summary: res.summary, tool: def.id });
            history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: res.ok, summary: res.summary, data: res.data ?? null }).slice(0, 8000) });
            if (!res.ok && (res as any).needsConfirm) history.push({ role: "user", content: "That action needs my explicit confirmation. Summarize what you WOULD do and stop." });
          }
        }
        activity("Step budget reached — summarizing", "done");
        try {
          const fin: any = await client.chat.completions.create({ model: mid, messages: [...history, { role: "user", content: "Summarize what was actually done vs what remains, briefly." }], temperature: 0.3 });
          const text = fin.choices[0]?.message?.content || "Stopped at the step budget with partial progress kept.";
          for (const ch of text) send({ delta: ch });
        } catch {
          send({ delta: "Stopped at the step budget with partial progress kept." });
        }
        send({ done: true });
        controller.close();
      } catch (e: any) {
        fail(e?.message || "Agent failed.");
      }
    },
    cancel() {},
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
}