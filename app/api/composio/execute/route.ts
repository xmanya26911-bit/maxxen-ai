import { NextResponse } from "next/server";

// REAL Composio tool execution (previously this only listed accounts).
// Body: { composioKey, tool, action?, params?, connectedAccountId? }
// - `tool` (or legacy `action`) is the Composio tool slug, e.g. "GMAIL_SEND_EMAIL".
// - `params`/`arguments` become the tool arguments.
// - `connectedAccountId` optional: pins which of the USER's connected
//   accounts runs it; omitted = Composio default resolution.
// Everything runs as the CALLER: their key, their connected accounts, their
// data. Upstream errors are surfaced verbatim so misconfig is debuggable.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const composioKey = body?.composioKey;
    const slug = body?.tool || body?.action;
    const args = body?.params ?? body?.arguments ?? {};
    const connectedAccountId = body?.connectedAccountId;
    if (!composioKey) return NextResponse.json({ error: "Missing Composio API key. Add YOUR key on /plugins." }, { status: 400 });
    if (!slug || typeof slug !== "string")
      return NextResponse.json({ error: "Missing tool slug. Pass { tool: 'TOOL_SLUG', params: {...} }." }, { status: 400 });
    if (args && (typeof args !== "object" || Array.isArray(args)))
      return NextResponse.json({ error: "params must be a JSON object." }, { status: 400 });

    const payload: Record<string, unknown> = { tool_slug: slug, arguments: args };
    if (connectedAccountId) payload.connected_account_id = connectedAccountId;

    const r = await fetch("https://backend.composio.dev/api/v3/tools/execute", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": composioKey },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = (j as any)?.error || (j as any)?.message || JSON.stringify(j).slice(0, 500);
      return NextResponse.json({ error: `Composio refused the call (HTTP ${r.status}): ${detail}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tool: slug, result: (j as any)?.data ?? j });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Composio execute failed" }, { status: 500 });
  }
}
