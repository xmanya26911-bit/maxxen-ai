import { NextResponse } from "next/server";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";
import { toOpenAITools, type Ctx } from "@/lib/tools";
import { buildRuntime } from "@/lib/maxxen-runtime";
import { createOpenAICompatClient } from "@/lib/ai/providers/openai";
import { encodeEvent, STREAM_HEADERS } from "@/lib/streaming/encode";
import type { AgentPhase, MaxxenEvent } from "@/lib/streaming/types";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

// REAL agent loop: MODEL → PLAN → TOOL → EXECUTE → RESULT → MODEL → … → FINAL.
// Streams CANONICAL events (lib/streaming) — the same protocol /api/chat uses:
//   run.start, agent.activity, tool.start/tool.delta/tool.result,
//   permission.request, message.delta, error, run.complete.
// Body: { messages, apiKey, baseURL, model, githubToken?, vercelToken?, composioKey?, maxSteps?, projectContext? }
// Rules: OpenAI-compatible endpoints only (Anthropic has no function-calling
// parity here — it gets a clear error, not a silent failure). Bounded loop
// (default 6 tool steps). Every tool runs as the CALLER with THEIR keys.
// Private chain-of-thought is never exposed — only concise activity lines.
// Identity, capabilities, and tools come from the Maxxen runtime (one stable
// identity for every model — the LLM is replaceable, Maxxen is not).
const MAX_STEPS = 6;

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  // Session seam (Phase 0) — observe-only; see lib/security/guard.
  if (SESSION_ENFORCED && !hasValidSession(req, body)) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }
  const { messages, apiKey, baseURL, model, provider, githubToken, vercelToken, composioKey, maxSteps, memory, projectContext } = body;
  const opencodeAgent = provider === "opencode";
  if (!apiKey && !opencodeAgent) return NextResponse.json({ error: "Missing API key." }, { status: 400 });
  if (provider === "anthropic" || /api\.anthropic\.com/i.test(String(baseURL || "")))
    return NextResponse.json(
      { error: "Agent loop needs an OpenAI-compatible endpoint (OpenAI, Gemini, or a Custom base URL like Groq, Ollama, OpenRouter). Claude's API has no function-calling parity here — use Claude in normal chat instead." },
      { status: 400 }
    );
  if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "No messages." }, { status: 400 });
  // OpenCode agent runs: chat-family models only (the loop speaks OpenAI-style
  // function-calling), endpoint pinned server-side. Keyless runs are refused
  // with an explicit message — the agent SDK client always sends auth, so
  // free-keyless agent use stays unsupported (free chat works in /chat).
  let url: string;
  if (provider === "opencode") {
    const { familyForModelId, isFreeModelId, OPENCODE_CHAT_URL } = await import(
      "@/lib/ai/providers/opencode-catalog"
    );
    const opencodeModel = ((model || "") as string).trim();
    if (!opencodeModel)
      return NextResponse.json({ error: "Pick an OpenCode model first (Settings → AI endpoint)." }, { status: 400 });
    if (familyForModelId(opencodeModel) !== "openai-chat")
      return NextResponse.json(
        { error: "\u201c" + opencodeModel + "\u201d cannot drive the agent loop — only OpenAI-chat-family OpenCode models support tools. Use it in /chat, or pick a chat-family model." },
        { status: 400 }
      );
    if (!apiKey)
      return NextResponse.json(
        {
          error: isFreeModelId(opencodeModel)
            ? "Agent runs need your OpenCode key even for free models (the agent client always sends auth). Add it in Settings → AI endpoint — or use this model keyless in /chat."
            : "OpenCode requires authentication for this model. Add your OpenCode key in Settings → AI endpoint.",
        },
        { status: 400 }
      );
    url = OPENCODE_CHAT_URL;
  } else {
    try {
      url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }
  const mid = ((model || "") as string).trim() || "gpt-4o-mini";
  const steps = Math.min(Math.max(Number(maxSteps) || MAX_STEPS, 1), 10);
  // Human gate: only an explicit user "Confirmed:" message (from the Confirm button)
  // authorizes world-changing tools. Model-supplied confirm is stripped below.
  const userConfirmed = Array.isArray(messages) && messages.some((m: any) => m?.role === "user" && typeof m?.content === "string" && m.content.startsWith("Confirmed:"));
  const email = typeof body?.userEmail === "string" ? body.userEmail.toLowerCase().trim() : undefined;
  const composioUserId =
    typeof body?.composioUserId === "string" && body.composioUserId.trim() ? body.composioUserId.trim() : undefined;
  const ctx: Ctx = { githubToken, vercelToken, composioKey, userConfirmed, email, composioUserId };

  // Maxxen runtime: capabilities probed live, tool registry filtered to what
  // is actually usable, one stable identity for every model.
  const runtime = await buildRuntime(ctx, { providerLabel: typeof provider === "string" && provider ? provider : "custom" });
  const openaiTools = toOpenAITools(runtime.tools) as any;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: MaxxenEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));
      const activity = (text: string, phase: AgentPhase = "tool", tool?: string) =>
        send({ type: "agent.activity", phase, text, tool });
      const fail = (message: string) => {
        send({ type: "agent.activity", phase: "error", text: message });
        send({ type: "error", message });
        controller.close();
      };
      send({ type: "run.start", mode: "agent", model: mid });
      try {
        const client = createOpenAICompatClient(apiKey, url);
        const { memoryBlock, sanitizeMemory } = await import("@/lib/memory");
        const memBlock = memoryBlock(memory ? sanitizeMemory(memory) : null);
        const history: any[] = [
          {
            role: "system",
            content:
              runtime.systemPrompt +
              (memBlock ? `\n\n${memBlock}` : "") +
              (typeof projectContext === "string" && projectContext.trim()
                ? `\n\nProject configuration (workspace context only — never model access):\n${projectContext.trim().slice(0, 4000)}`
                : ""),
          },
          ...budgeted(sanitizeMessages(messages)),
        ];
        activity("Planning", "planning");
        {
          const live = new Set(runtime.tools.map((t) => t.kind));
          const names: string[] = [];
          if (live.has("project")) names.push("GitHub");
          if (live.has("deploy")) names.push("Vercel");
          if (live.has("composio")) names.push("Composio");
          activity(
            names.length ? `Integrations live: ${names.join(", ")}` : "No integrations configured — work will be chat-only",
            "planning"
          );
        }
        for (let step = 0; step < steps; step++) {
          let out: any;
          try {
            out = await client.chat.completions.create({
              model: mid,
              messages: history,
              temperature: 0.3,
              tools: openaiTools,
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
            for (const ch of text) send({ type: "message.delta", text: ch });
            send({ type: "run.complete", mode: "agent" });
            controller.close();
            return;
          }
          history.push({ role: "assistant", content: text || null, tool_calls: calls });
          for (const call of calls) {
            const def = runtime.tools.find((t) => t.id === call.function?.name);
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function?.arguments || "{}");
            } catch {
              history.push({ role: "tool", tool_call_id: call.id, content: "Invalid tool arguments JSON — ask the model to retry with valid JSON." });
              activity(`Skipped malformed args for “${call.function?.name}”`);
              continue;
            }
            // Strip model-controlled authorization — only ctx.userConfirmed counts.
            if ("confirm" in args) delete (args as any).confirm;
            if (!def) {
              history.push({ role: "tool", tool_call_id: call.id, content: "Unknown tool — skipped." });
              activity(`Skipped unknown tool “${call.function?.name}”`);
              continue;
            }
            activity(`${def.id}`, "tool", def.id);
            send({ type: "tool.start", callId: call.id, tool: def.id });
            let res;
            try {
              res = await def.run(args, ctx);
            } catch (e: any) {
              res = { ok: false as const, summary: e?.message || "Tool crashed." };
            }
            // Token-by-token result streaming: the full result text goes out
            // as small word-boundary chunks (toolDelta) and the client
            // typewriter-renders them, so long tool outputs stream live
            // instead of landing as one block at step end.
            const resultText = res.ok ? res.summary : `Failed: ${res.summary}`;
            const dataExcerpt =
              res.ok && res.data !== undefined && res.data !== null
                ? `\n${JSON.stringify(res.data).slice(0, 1200)}`
                : "";
            const full = `${resultText}${dataExcerpt}`;
            const words = full.split(/(\s+)/);
            let piece = "";
            const flushPiece = () => {
              if (piece) {
                send({ type: "tool.delta", callId: call.id, tool: def.id, chunk: piece });
                piece = "";
              }
            };
            for (const w of words) {
              piece += w;
              if (piece.length >= 24) flushPiece();
            }
            flushPiece();
            // Terminal event for this call: signals completion (the client's
            // typewriter finishes draining) and carries the structured result.
            let resultData: unknown;
            if (res.ok && res.data !== undefined && res.data !== null) {
              try {
                resultData = JSON.parse(JSON.stringify(res.data));
              } catch {
                /* non-serializable — summary text already streamed */
              }
            }
            send({ type: "tool.result", callId: call.id, tool: def.id, ok: res.ok, data: resultData });
            const line = res.ok ? `✓ ${res.summary}` : `✗ ${res.summary}`;
            activity(line, res.ok ? "tool" : "error", def.id);
            if (!res.ok && (res as any).needsConfirm) {
              send({ type: "permission.request", tool: def.id, summary: res.summary });
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
          for (const ch of text) send({ type: "message.delta", text: ch });
        } catch {
          send({ type: "message.delta", text: "Stopped at the step budget with partial progress kept." });
        }
        send({ type: "run.complete", mode: "agent" });
        controller.close();
      } catch (e: any) {
        fail(e?.message || "Agent failed.");
      }
    },
    cancel() {},
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
