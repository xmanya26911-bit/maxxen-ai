import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { composioKey, toolkit, params } = await req.json();
    const key = composioKey || process.env.COMPOSIO_API_KEY;
    if (!key) return NextResponse.json({ error: "Missing Composio API key. Add in Settings > Plugins." }, { status: 400 });
    const res = await fetch("https://backend.composio.dev/api/v3/connected_accounts/list", {
      method: "GET",
      headers: { "x-api-key": key } as any,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, toolkit: toolkit ?? "all", connected: data, hint: `Connect ${toolkit ?? "a toolkit"} at app.composio.dev, then call its tools from Maxxen chat.`, params: params ?? {} });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Composio failed" }, { status: 500 });
  }
}
