import { NextResponse } from "next/server";

// Composio schema inventory: list executable tools, optionally filtered by
// toolkit. Tolerates schema variety — only tools with a usable name are
// exposed; anything unrepresentable is counted, not executed.
// Body: { composioKey, toolkit?, limit? }
export async function POST(req: Request) {
  try {
    const { composioKey, toolkit, limit } = await req.json();
    if (!composioKey) return NextResponse.json({ error: "Missing Composio API key. Add YOUR key on /plugins." }, { status: 400 });
    const n = Math.min(Math.max(Number(limit) || 100, 1), 200);

    const attempts: string[] = [];
    if (toolkit) attempts.push(`https://backend.composio.dev/api/v3/tools?toolkit_slug=${encodeURIComponent(String(toolkit))}&limit=${n}`);
    attempts.push(`https://backend.composio.dev/api/v3/tools?limit=${n}`);

    let lastErr = "";
    for (const url of attempts) {
      try {
        const r = await fetch(url, { headers: { "x-api-key": composioKey } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const rawErr = (j as any)?.error ?? (j as any)?.message;
          lastErr = `HTTP ${r.status}: ${typeof rawErr === "string" ? rawErr : JSON.stringify(rawErr ?? j).slice(0, 200)}`;
          continue;
        }
        const raw = Array.isArray(j) ? j : (j as any)?.items || (j as any)?.tools || (j as any)?.data || [];
        if (!Array.isArray(raw)) {
          lastErr = "Unexpected inventory shape.";
          continue;
        }
        const tools: { slug: string; name: string; description: string; toolkit: string }[] = [];
        let skipped = 0;
        for (const t of raw) {
          const slug = t?.slug ?? t?.name ?? t?.tool_slug;
          if (!slug || typeof slug !== "string") {
            skipped++;
            continue;
          }
          tools.push({
            slug,
            name: t?.name || slug,
            description: String(t?.description || "").slice(0, 300),
            toolkit: t?.toolkit_slug || t?.toolkit || toolkit || "unknown",
          });
        }
        return NextResponse.json({ ok: true, toolkit: toolkit || "all", count: tools.length, skipped, tools: tools.slice(0, n) });
      } catch (e: any) {
        lastErr = e.message || "fetch failed";
      }
    }
    return NextResponse.json({ error: `Tool inventory unavailable: ${lastErr}` }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Inventory failed" }, { status: 500 });
  }
}
