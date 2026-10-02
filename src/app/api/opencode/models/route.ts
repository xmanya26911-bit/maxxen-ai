import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/ai/providers/opencode-catalog";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

/**
 * GET /api/opencode/models — live OpenCode model catalog for the picker.
 *
 * Server-side fetch (keeps discovery in one place, cached 1h) of
 * https://opencode.ai/inference/v1/models, enriched with free/API-family
 * metadata. No key required — the catalog endpoint is public, and free
 * models need no authentication. Response labels its source
 * ("live" | "fallback" | "stale") so the UI can say when the list is
 * degraded instead of silently serving old data.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (SESSION_ENFORCED && !hasValidSession(req)) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }
  try {
    const { models, source, fetchedAt } = await getCatalog(fetch);
    return NextResponse.json({
      ok: true,
      source,
      fetchedAt,
      count: models.length,
      free: models.filter((m) => m.free).length,
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        free: m.free,
        family: m.family,
        authRequired: m.authRequired,
        capabilities: m.capabilities,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Model discovery failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
