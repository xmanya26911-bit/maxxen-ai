import { NextResponse } from "next/server";

// Minimal Composio passthrough.
// Frontend sends { toolkit, action?, params?, composioKey }.
// Server forwards to Composio REST so the key never has to be hardcoded.
// Docs: https://docs.composio.dev — set COMPOSIO_API_KEY in .env.local or paste in UI.
export async function POST(req: Request) {
  try {
    const { composioKey, toolkit, params } = await req.json();
    const key = composioKey || process.env.COMPOSIO_API_KEY;
    if (!key) return NextResponse.json({ error: "Missing Composio API key. Add in Settings > Plugins." }, { status: 400 });
    // MVP: return connection guidance; full tool execution happens via /api/composio/execute or agent.
    // Keeping it generic so ANY toolkit works (gmail, github, vercel, notion, etc.)
    const res = await fetch("https://backend.composio.dev/api/v3/connected_accounts/list", {
      method: "GET",
      headers: { "x-api-key": key } as any,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as any)?.error ?? (data as any)?.message ?? `HTTP ${res.status}`;
      return NextResponse.json({ error: `Composio rejected the key (${detail}). Check YOUR key on /plugins.` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, toolkit: toolkit ?? "all", connected: data, hint: `Connect ${toolkit ?? "a toolkit"} at app.composio.dev, then call its tools from Maxxen chat.`, params: params ?? {} });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Composio failed" }, { status: 500 });
  }
}
