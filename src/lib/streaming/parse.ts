import { isMaxxenEvent } from "./events";
import type { MaxxenEvent } from "./types";

/**
 * Client-side parser for the canonical MAXXEN event stream.
 *
 * Feed it raw streamed chunks (Uint8Array or string) and it returns the events
 * that became complete. It is deliberately defensive:
 *  - events split across chunks are buffered until complete,
 *  - multiple events in one chunk are all returned,
 *  - partial UTF-8 sequences are handled via a streaming TextDecoder,
 *  - malformed frames are dropped, never thrown.
 *
 * Pure and synchronous — independently testable without a network.
 */
export interface EventParser {
  /** Ingest a chunk; returns every complete event it unlocked. */
  push(chunk: Uint8Array | string): MaxxenEvent[];
  /** Flush any buffered final frame (call once the stream ends). */
  flush(): MaxxenEvent[];
}

/**
 * Parse one SSE frame (the text between blank lines) into an event, or null
 * when the frame carries no valid event. The JSON `type` field is trusted; a
 * leading `event:` line is only informational.
 */
export function parseFrame(frame: string): MaxxenEvent | null {
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (!dataLines.length) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  return isMaxxenEvent(parsed) ? parsed : null;
}

export function createEventParser(): EventParser {
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = (final: boolean): MaxxenEvent[] => {
    const events: MaxxenEvent[] = [];
    if (buffer.indexOf("\r\n") !== -1) buffer = buffer.replace(/\r\n/g, "\n");
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = parseFrame(frame);
      if (event) events.push(event);
    }
    // Allow a final frame with no trailing blank line.
    if (final && buffer.trim().length > 0) {
      const event = parseFrame(buffer);
      if (event) events.push(event);
      buffer = "";
    }
    return events;
  };

  return {
    push(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      return drain(false);
    },
    flush() {
      buffer += decoder.decode();
      return drain(true);
    },
  };
}
