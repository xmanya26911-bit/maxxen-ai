import { NextResponse } from "next/server";
import OpenAI from "openai";
import { assertSafeBaseURL } from "@/lib/net-guard";
import { budgeted, sanitizeMessages } from "@/lib/context";

// Streaming twin of /api/chat: Server-Sent Events, one JSON payload per line:
//   data: {"delta":"..."} … data: {"done":true,"mode":"build"} | data: {"error":"..."}
// Body: same as /api/chat ({ messages, apiKey, baseURL, model, provider, mode }).
// Anthropic streams content_block_delta events; OpenAI-compatible uses deltas.
const MODES: Record<string, string> = {
  chat: `Chat freely and helpfully. Be concise.`,
  build: `Build a complete, SINGLE-FILE HTML page. Output exactly one \`\`\`html block containing the entire page (inline CSS+JS, no external build step). Before it, give a 2-line plan. After it, 2 lines on how to open/deploy it. Do not output multiple files.`,
  code: `Answer with code first. Output fenced code blocks, each labeled with language and path like \`\`\`tsx:components/Button.tsx. Keep prose minimal — short plan, then code, then how to run.`,
  design: `Act as a product designer + frontend engineer. Prioritize typography, spacing, hierarchy and restraint. Output a single \`\`\`html block with the design implemented, plus 3 bullet notes on the design decisions.`,
  research: `Research carefully and show your work: key findings as bullets, trade-offs, and a recommendation. Cite what you checked. Never invent sources, versions or APIs — say when unsure.`,
  deploy: `Guide shipping: explain the exact deploy steps for the user's own Vercel project (import repo, env vars, deploy), plus a pre-deploy checklist (build passes, env set, domains). If they paste an error, diagnose it precisely.`,
  agent: `Work like an engineering collaborator: break the task into numbered file operations, narrate each step, finish with what changed and what to verify. You cannot run commands yourself — be explicit and give exact commands.`,
};

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { messages, apiKey, baseURL, model, provider, mode } = body;
  if (!apiKey) return NextResponse.json({ error: "Missing API key." }, { status: 400 });
  if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "No messages to send." }, { status: 400 });
  const clean = sanitizeMessages(messages);
  if (!clean.length) return NextResponse.json({ error: "No valid messages to send." }, { status: 400 });

  const modeKey = typeof mode === "string" && MODES[mode.toLowerCase()] ? mode.toLowerCase() : "chat";
  const system = `You are Maxxen AI, a multipurpose agentic builder inside the Maxxen workspace.\n\nMode: ${modeKey.toUpperCase()}\n${MODES[modeKey]}`;
  const sized = budgeted(clean);
  let url: string;
  try {
    url = assertSafeBaseURL(baseURL, "https://api.openai.com/v1");
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  const mid = ((model || "") as string).trim() || "gpt-4o-mini";
  const useAnthropic = provider === "anthropic" || /api\.anthropic\.com/i.test(url);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
      const fail = (message: string) => {
        send({ error: message });
        controller.close();
      };
      try {
        if (useAnthropic) {
          const r = await fetch(`${url.replace(/\/$/, "")}/v1/messages`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify({ model: mid === "gpt-4o-mini" ? "claude-3-5-haiku-latest" : mid, max_tokens: 4096, stream: true, system, messages: sized }),
          });
          if (!r.ok || !r.body) {
            const j = await r.json().catch(() => ({}));
            fail(`${r.status} ${(j as any)?.error?.message || "Anthropic request failed"}`);
            return;
          }
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let empty = true;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() || "";
            for (const part of parts) {
              const line = part.split("\n").find((l) => l.startsWith("data:"));
              if (!line) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const ev = JSON.parse(payload);
                const delta = ev?.delta?.text;
                if (typeof delta === "string" && delta) {
                  empty = false;
                  send({ delta });
                }
              } catch {
                /* partial chunk — wait for more */
              }
            }
          }
          if (empty) fail("Model returned an empty response. Retry, or switch models.");
          else send({ done: true, mode: modeKey });
          controller.close();
          return;
        }

        const client = new OpenAI({ apiKey, baseURL: url });
        const gen = await client.chat.completions.create({
          model: mid,
          messages: [{ role: "system", content: system }, ...sized],
          temperature: 0.7,
          stream: true,
        });
        let empty = true;
        for await (const chunk of gen) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            empty = false;
            send({ delta });
          }
          if ((req as any).signal?.aborted) break;
        }
        if (empty) fail("Model returned an empty response. Retry, or switch models.");
        else send({ done: true, mode: modeKey });
        controller.close();
      } catch (e: any) {
        fail(e?.message || "Stream failed.");
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
