export const MAX_TOTAL_CHARS = 48000;
export const MAX_MSG_CHARS = 12000;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export function sanitizeMessages(input: unknown): ChatMsg[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x: any) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
    .map((x: any) => ({ role: x.role as "user" | "assistant", content: x.content }));
}

export function budgeted(clean: ChatMsg[]): ChatMsg[] {
  const sized = clean.map((m) => ({ ...m, content: m.content.slice(0, MAX_MSG_CHARS) }));
  let total = sized.reduce((n, m) => n + m.content.length, 0);
  if (total <= MAX_TOTAL_CHARS) return sized;
  const first = sized[0];
  const tail: ChatMsg[] = [];
  let keep = MAX_TOTAL_CHARS - Math.min(first.content.length, 6000);
  for (let i = sized.length - 1; i >= 1 && keep > 0; i--) {
    tail.unshift(sized[i]);
    keep -= sized[i].content.length;
  }
  return [first, ...tail];
}