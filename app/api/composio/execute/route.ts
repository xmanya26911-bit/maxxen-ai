import { NextResponse } from "next/server";
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const composioKey = body?.composioKey;
    const slug = body?.tool || body?.action;
    const args = body?.params ?? body?.arguments ?? {};
    const connectedAccountId = body?.connectedAccountId;
    const confirm = body?.confirm;
    if (!composioKey || typeof composioKey !== "string") return NextResponse.json({ error: "Missing Composio API key. Add YOUR key on /plugins." }, { status: 400 });
    if (!slug || typeof slug !== "string") return NextResponse.json({ error: "Missing tool slug. Pass { tool: 'TOOL_SLUG', params: {...} }." }, { status: 400 });
    if (args && (typeof args !== "object" || Array.isArray(args))) return NextResponse.json({ error: "params must be a JSON object." }, { status: 400 });
    const hay = slug + " " + JSON.stringify(args);
    const destructive = /send|delete|remove|create|update|publish|post|forward|reply|archive|share|invite|trash/i.test(hay);
    if (destructive && confirm !== true) {
      return NextResponse.json({ error: "\"" + slug + "\" changes the outside world — pass { confirm: true } after explicit user confirmation.", needsConfirm: true }, { status: 403 });
    }
    const payload: Record<string, unknown> = { tool_slug: slug, arguments: args };
    if (connectedAccountId) payload.connected_account_id = connectedAccountId;
    const r = await fetch("https://backend.composio.dev/api/v3/tools/execute", { method: "POST", headers: { "content-type": "application/json", "x-api-key": composioKey }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const rawErr = (j as any)?.error ?? (j as any)?.message ?? j;
      const detail = typeof rawErr === "string" ? rawErr : JSON.stringify(rawErr).slice(0, 500);
      return NextResponse.json({ error: "Composio refused the call (HTTP " + r.status + "): " + detail }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tool: slug, result: (j as any)?.data ?? j });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Composio execute failed" }, { status: 500 });
  }
}