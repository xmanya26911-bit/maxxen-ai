import { NextResponse } from "next/server";

/**
 * GET /api/assistant-tools/status — operator configuration presence.
 *
 * Returns ONLY booleans (is a search endpoint set?). The endpoint URL itself
 * is server configuration and is never exposed to the browser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = (process.env.SEARXNG_BASE_URL || "").trim();
  return NextResponse.json({ ok: true, searchConfigured: base.length > 0 });
}
