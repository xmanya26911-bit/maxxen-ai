import { POST as canonicalChat } from "@/app/api/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Backward-compatible streaming endpoint.
 * The canonical provider/runtime implementation lives in /api/chat.
 * This adapter preserves the older {delta, done, error} SSE contract for
 * clients that have not migrated to canonical MaxxenEvents yet.
 */
export async function POST(req: Request) {
  const response = await canonicalChat(req);
  if (!response.body || !response.ok) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const event = JSON.parse(raw);
              if (event.type === "message.delta") send({ delta: event.text || "" });
              else if (event.type === "error") send({ error: event.message || "Stream failed." });
              else if (event.type === "run.complete") send({ done: true, mode: event.mode || "chat" });
            } catch {
              // Ignore incomplete SSE frames; the next chunk will complete them.
            }
          }
        }
        if (buffer.trim()) {
          const line = buffer.split("\n").find((l) => l.startsWith("data:"));
          if (line) {
            try {
              const event = JSON.parse(line.slice(5).trim());
              if (event.type === "message.delta") send({ delta: event.text || "" });
              else if (event.type === "error") send({ error: event.message || "Stream failed." });
              else if (event.type === "run.complete") send({ done: true, mode: event.mode || "chat" });
            } catch {}
          }
        }
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Stream failed." });
      } finally {
        controller.close();
      }
    },
    cancel() { reader.cancel().catch(() => undefined); },
  });

  return new Response(stream, {
    status: response.status,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
