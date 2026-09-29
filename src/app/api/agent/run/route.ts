import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { MAX_TOOL_CHARS, budgetAgentHistory, sanitizeMessages } from "@/lib/context";
import { toOpenAITools, type Ctx } from "@/lib/tools";
import { buildRuntime } from "@/lib/maxxen-runtime";
import { normalizeMode } from "@/lib/modes";

// REAL agent loop: MODEL → PLAN → TOOL → EXECUTE → RESULT → MODEL → … → FINAL.
// SSE events (one JSON per line):
//   activity {"phase":"planning|tool|done|error", "text":"…", "tool"?:id}
//   delta {"delta":"…"}            streamed answer text
//   toolStart/toolDelta/toolDone   token-by-token tool result streaming
//   toolResult {"id","tool","data"}  machine-readable result (e.g. a deploy id)
//   needsConfirm {"summary","tool"}  a world-changing tool paused for the user
//   done {"done":true} | {"error":"…"}
// Body: { messages, mode?, apiKey, baseURL, model, provider?, githubToken?,
//         vercelToken?, composioKey?, maxSteps?, memory?, userEmail?,
//         composioUserId? }
//
// Streaming is REAL: every model call uses `stream: true` and upstream deltas
// are forwarded the moment they arrive. (It used to run a blocking completion
// per step and then replay the finished text one character at a time, which
// made every answer feel stalled; narration that precedes a tool call now
// arrives live too, so a multi-step run is observable while it happens.)
//
// Context is re-budgeted before EVERY step: tool results are pushed back into
// the history, and without re-budgeting a couple of file reads are enough to
// blow the model's window mid-run. See budgetAgentHistory in src/lib/context.ts.
//
// Rules: OpenAI-compatible endpoints only (Anthropic has no function-calling
// parity here — it gets a clear error, not a silent failure). Bounded loop
// (default 6 steps, at most 10; at most MAX_CALLS_PER_STEP tools per step).
// Every tool runs as the CALLER with THEIR keys. Private chain-of-thought is
// never exposed — only concise activity lines.
// Identity, capabilities, and tools come from the Maxxen runtime (one stable
// identity for every model — the LLM is replaceable, Maxxen is not).
const MAX_STEPS = 6;
const MAX_CALLS_PER_STEP = 4;

type StreamToolCall = { id: string; name: string; args: string };

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const {
    messages,
    apiKey,
    baseURL,
    model,
    provider,
    githubToken,
    vercelToken,
    composioKey,
    maxSteps,
    memory,
    mode,
  } = body;
  if (!apiKey) return NextResponse.json({ error: "Missing API key." }, { status: 400 });
  if (provider === "anthropic" || /api\.anthropic\.com/i.test(String(baseURL || "")))
    return NextResponse.json(
      {
        error:
          "Agent loop needs an OpenAI-compatible endpoint (OpenAI, Gemini, or a Custom base URL like Groq, Ollama, OpenRouter). Claude's API has no function-calling parity here — use Claude in normal chat instead.",
      },
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
  // Human gate: only an explicit user "Confirmed:" message (from the Confirm
  // button) authorizes world-changing tools. Model-supplied confirm is stripped
  // before execution — see the tool loop below.
  const userConfirmed =
    Array.isArray(messages) &&
    messages.some(
      (m: any) => m?.role === "user" && typeof m?.content === "string" && m.content.startsWith("Confirmed:")
    );
  const email = typeof body?.userEmail === "string" ? body.userEmail.toLowerCase().trim() : undefined;
  const composioUserId =
    typeof body?.composioUserId === "string" && body.composioUserId.trim() ? body.composioUserId.trim() : undefined;
  const ctx: Ctx = { githubToken, vercelToken, composioKey, userConfirmed, email, composioUserId };

  // Maxxen runtime: capabilities probed live, tool registry filtered to what is
  // actually usable, one stable identity for every model.
  const runtime = await buildRuntime(ctx, {
    providerLabel: typeof provider === "string" && provider ? provider : "custom",
    mode: normalizeMode(mode),
  });
  const openaiTools = toOpenAITools(runtime.tools) as any;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const activity = (text: string, phase = "tool", tool?: string) => send({ activity: { phase, text, tool } });
      const close = () => {
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      const fail = (message: string) => {
        activity(message, "error");
        send({ error: message });
        close();
      };
      try {
        const client = new OpenAI({ apiKey, baseURL: url });
        const { memoryBlock, sanitizeMemory } = await import("@/lib/memory");
        const memBlock = memoryBlock(memory ? sanitizeMemory(memory) : null);
        const system = runtime.systemPrompt + (memBlock ? `\n\n${memBlock}` : "");
        let history: any[] = [{ role: "system", content: system }, ...sanitizeMessages(messages)];

        activity("Planning", "planning");
        {
          const live = new Set(runtime.tools.map((t) => t.kind));
          const names: string[] = [];
          if (live.has("project")) names.push("GitHub");
          if (live.has("deploy")) names.push("Vercel");
          if (live.has("composio")) names.push("Composio");
          activity(
            names.length
              ? `Integrations live: ${names.join(", ")} · ${runtime.tools.length} tools`
              : "No integrations configured — work will be chat-only",
            "planning"
          );
        }


        for (let step = 0; step < steps; step++) {
          // Re-budget before EVERY call: the tool results appended below are
          // exactly what makes a long run overflow the model's window.
          const budgeted = budgetAgentHistory(system, history.slice(1));
          history = budgeted.messages;
          if (budgeted.droppedTurns > 0) {
            activity(
              `Context budget: dropped ${budgeted.droppedTurns} older turn${
                budgeted.droppedTurns === 1 ? "" : "s"
              } to stay inside the model window`,
              "planning"
            );
          }

          let upstream: any;
          try {
            upstream = await client.chat.completions.create({
              model: mid,
              messages: history,
              temperature: 0.3,
              tools: openaiTools,
              tool_choice: "auto" as any,
              stream: true,
            });
          } catch (e: any) {
            fail(e?.message || "Model call failed.");
            return;
          }

          let text = "";
          const slots: StreamToolCall[] = [];
          try {
            for await (const chunk of upstream as any) {
              if ((req as any).signal?.aborted) break;
              const delta: any = chunk?.choices?.[0]?.delta;
              if (!delta) continue;
              if (typeof delta.content === "string" && delta.content) {
                text += delta.content;
                send({ delta: delta.content }); // real upstream token, forwarded now
              }
              for (const tc of delta.tool_calls ?? []) {
                const key = Number.isFinite(tc?.index) ? Number(tc.index) : 0;
                const slot = slots[key] ?? (slots[key] = { id: "", name: "", args: "" });
                if (typeof tc?.id === "string" && tc.id) slot.id = tc.id;
                if (typeof tc?.function?.name === "string" && tc.function.name) slot.name = tc.function.name;
                if (typeof tc?.function?.arguments === "string") slot.args += tc.function.arguments;
              }
            }
          } catch (e: any) {
            const detail = String(e?.message || e).slice(0, 200);
            if (!text.trim() && slots.filter(Boolean).length === 0) {
              fail(detail || "Model stream failed.");
              return;
            }
            // Partial turn: keep what arrived, tell the user the socket dropped.
            activity(`Upstream stream ended early: ${detail}`, "error");
          }

          const calls = slots.filter(Boolean);
          if (!calls.length) {
            if (!text.trim()) {
              fail("Model returned nothing. Retry, or switch models.");
              return;
            }
            send({ done: true });
            close();
            return;
          }

          const assistantCalls = calls.map((c, i) => ({
            id: c.id || `call_maxxen_${step}_${i}`,
            type: "function" as const,
            function: { name: c.name, arguments: c.args || "{}" },
          }));
          history.push({ role: "assistant", content: text || null, tool_calls: assistantCalls });



          for (const call of assistantCalls.slice(0, MAX_CALLS_PER_STEP)) {
            const def = runtime.tools.find((t) => t.id === call.function?.name);
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function?.arguments || "{}");
            } catch {
              history.push({
                role: "tool",
                tool_call_id: call.id,
                content: "Invalid tool arguments JSON — ask the model to retry with valid JSON.",
              });
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
            send({ toolStart: { id: call.id, tool: def.id } });
            let res;
            try {
              res = await def.run(args, ctx);
            } catch (e: any) {
              res = { ok: false as const, summary: e?.message || "Tool crashed." };
            }
            // Token-by-token result streaming: the full result text goes out as
            // small word-boundary chunks (toolDelta) and the client
            // typewriter-renders them, so long tool outputs stream live instead
            // of landing as one block at step end.
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
                send({ toolDelta: { id: call.id, tool: def.id, chunk: piece } });
                piece = "";
              }
            };
            for (const w of words) {
              piece += w;
              if (piece.length >= 24) flushPiece();
            }
            flushPiece();
            send({ toolDone: { id: call.id, tool: def.id, ok: res.ok } });
            if (res.ok && res.data !== undefined && res.data !== null) {
              try {
                const snapshot = JSON.parse(JSON.stringify(res.data));
                send({ toolResult: { id: call.id, tool: def.id, data: snapshot } });
              } catch {
                /* non-serializable — summary text already streamed */
              }
            }
            const line = res.ok ? `✓ ${res.summary}` : `✗ ${res.summary}`;
            activity(line, res.ok ? "tool" : "error", def.id);
            if (!res.ok && (res as any).needsConfirm) {
              send({ needsConfirm: true, summary: res.summary, tool: def.id });
            }
            history.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ ok: res.ok, summary: res.summary, data: res.data ?? null }).slice(
                0,
                MAX_TOOL_CHARS
              ),
            });
            if (!res.ok && (res as any).needsConfirm) {
              history.push({
                role: "user",
                content:
                  "That action needs my explicit confirmation. Summarize what you WOULD do and stop — do not retry it.",
              });
            }
          }

          // Every tool_call in the assistant turn MUST get a matching tool
          // message or the next request is rejected — so deferred ones are
          // answered explicitly instead of being dropped.
          const deferred = assistantCalls.slice(MAX_CALLS_PER_STEP);
          for (const call of deferred) {
            history.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Not run: per-step tool limit (${MAX_CALLS_PER_STEP}) reached. Re-issue this call in the next step if it is still needed.`,
            });
          }
          if (deferred.length) {
            activity(`Per-step tool limit: ${deferred.length} call(s) deferred to the next step`);
          }
        }

        // Step budget exhausted: stream a closing summary, keep partial work.
        activity("Step budget reached — summarizing", "done");
        try {
          const summaryHistory: any[] = budgetAgentHistory(system, [
            ...history.slice(1),
            { role: "user", content: "Summarize what was actually done vs what remains, briefly." },
          ]).messages;
          const fin: any = await client.chat.completions.create({
            model: mid,
            messages: summaryHistory,
            temperature: 0.3,
            stream: true,
          });
          let sawText = false;
          for await (const chunk of fin as any) {
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              sawText = true;
              send({ delta });
            }
          }
          if (!sawText) send({ delta: "Stopped at the step budget with partial progress kept." });
        } catch {
          send({ delta: "Stopped at the step budget with partial progress kept." });
        }
        send({ done: true });
        close();
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

