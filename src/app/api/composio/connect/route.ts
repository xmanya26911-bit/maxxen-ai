import { NextResponse } from "next/server";
import { cleanComposioKey, composioErrorDetail, composioHeaders } from "@/lib/composio";

// Composio connection check (API-key architecture — no OAuth/integration flow).
// Frontend sends { toolkit?, composioKey }. Server validates the key against
// Composio and reports reachable/failed with the REAL upstream reason.
export async function POST(req: Request) {
  try {
    const { composioKey, toolkit, params } = await req.json();
    const key = cleanComposioKey(composioKey || process.env.COMPOSIO_API_KEY);
    if (!key) {
      return NextResponse.json({ error: "Missing Composio API key. Add in Settings > Plugins." }, { status: 400 });
    }
    const res = await fetch("https://backend.composio.dev/api/v3/connected_accounts/list", {
      method: "GET",
      headers: composioHeaders(key),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: `Composio rejected the key (${composioErrorDetail(data, res.status)}). Check YOUR key on /plugins.` },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      toolkit: toolkit ?? "all",
      connected: data,
      hint: `Connect ${toolkit ?? "a toolkit"} at app.composio.dev, then call its tools from Maxxen chat.`,
      params: params ?? {},
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err?.message ?? "Composio failed" }, { status: 500 });
  }
}
