import type { MaxxenEvent } from "./types";

/**
 * The single canonical wire representation of a MaxxenEvent.
 *
 * Server-Sent-Events framing: an `event:` line naming the type (for
 * readability / proxies) followed by one `data:` line carrying the full JSON
 * event (the JSON's own `type` field is authoritative, so a missing `event:`
 * line still parses). Frames are terminated by a blank line.
 *
 * Both `/api/chat` and `/api/agent/run` must emit frames ONLY through here.
 */
export function encodeEvent(event: MaxxenEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Convenience for emitting several events at once (rarely needed). */
export function encodeEvents(events: Iterable<MaxxenEvent>): string {
  let out = "";
  for (const event of events) out += encodeEvent(event);
  return out;
}

/** Shared response headers for a canonical event stream. */
export const STREAM_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};
