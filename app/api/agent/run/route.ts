import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";
import { registry, toOpenAITools, type Ctx } from "@/lib/tools";

// REAL agent loop: MODEL → PLAN → TOOL → EXECUTE → RESULT → MODEL → … → FINAL.
// SSE events (one JSON per line):
//   activity {"phase":"planning|tool|done|error", "text":"…", "tool"?:id}
//   delta {"delta":"…"}            streaming final-answer text
//   done {"done":true} | {"error":"…"}
// Body: { messages, apiKey, baseURL, model, githubToken?, vercelToken?, composioKey?, maxSteps? }
// Rules: OpenAI-compatible endpoints only (Anthropic has no function-calling
// parity here — it gets a clear error, not a silent failure). Bounded loop
// (default 6 tool steps). Every tool runs as the CALLER with THEIR keys.
// Private chain-of-thought is never exposed — only concise activity lines.
const MAX_STEPS = 6;
const AGENT_SYSTEM = `You are Maxxen, an engineering agent inside the user's own workspace. Think step by step, then ACT with tools — never claim an action you didn't take.
Available tools do real things (user's GitHub, Vercel, Composio). Prefer inspecting (project_list/project_read, vercel_deploy_status) before changing anything. Batch independent reads in one block.
For builds: create complete single-file HTML under builds/<chatId>/ via project_write, then report. For deploys: vercel_deploy REQUIRES the user to confirm first — if confirm is missing, explain what you WOULD deploy and stop.
Keep activity narration to short imperative lines. Final answer: what changed, file paths, how to verify.`;

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { messages, apiKey, baseURL, model, provider, githubToken, vercelToken, composioKey, maxSteps } = body;
  if (!apiKey) return NextResponse.json({ error: "Missing API key." }, { status: 400 });
  if (provider === "anthropic" || /api\.anthropic\.com/i.test(String(baseURL || "")))
    return NextResponse.json(
      { error: "Agent loop needs an OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Ollama…). Claude's API has no function-calling parity here — use Claude in normal chat instead." },
      { status: 400 }
    );
  if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "No messages." }, { status: 400 });
  let url: string;
  try {
    url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  const mid = ((model || "") as string).trim() || "gpt-4o-mini";
  const steps = Math.min(Math.max(Number(maxSteps) || MAX_STEPS, 1), 10);
  const ctx: Ctx = { githubToken, vercelToken, composioKey };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
      const activity = (text: string, phase = "tool", tool?: string) => send({ activity: { phase, text, tool } });
      const fail = (message: string) => {
        send({ activity: { phase: "error", text: message } });
        send({ error: message });
        controller.close();
      };
      try {
        const client = new OpenAI({ apiKey, baseURL: url });
        const history: any[] = [
          { role: "system", content: AGENT_SYSTEM },
          ...budgeted(sanitizeMessages(messages)),
        ];
        activity("Planning", "planning");
        for (let step = 0; step < steps; step++) {
          let out: any;
          try {
            out = await client.chat.completions.create({
              model: mid,
              messages: history,
              temperature: 0.3,
              tools: toOpenAITools() as any,
              tool_choice: "auto" as any,
            });
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
              args = {};
            }
            if (!def) {
              history.push({ role: "tool", tool_call_id: call.id, content: "Unknown tool — skipped." });
              activity(`Skipped unknown tool “${call.function?.name}”`);
              continue;
            }
            activity(`${def.id}`, "tool", def.id);
            let res;
            try {
              res = await def.run(args, ctx);
            } catch (e: any) {
              res = { ok: false as const, summary: e?.message || "Tool crashed." };
            }
            const line = res.ok ? `✓ ${res.summary}` : `✗ ${res.summary}`;
            activity(line, res.ok ? "tool" : "error", def.id);
            if (!res.ok && (res as any).needsConfirm) {
              send({ needsConfirm: true, summary: res.summary, tool: def.id });
            }
            history.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ ok: res.ok, summary: res.summary, data: res.data ?? null }).slice(0, 8000),
            });
            if (!res.ok && (res as any).needsConfirm) {
              history.push({
                role: "user",
                content: "That action needs my explicit confirmation. Summarize what you WOULD do and stop — do not retry it.",
              });
            }
          }
        }
        // Step budget exhausted: stream a closing summary, keep partial work.
        activity("Step budget reached — summarizing", "done");
        try {
          const fin: any = await client.chat.completions.create({
            model: mid,
            messages: [...history, { role: "user", content: "Summarize what was actually done vs what remains, briefly." }],
            temperature: 0.3,
          });
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

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
