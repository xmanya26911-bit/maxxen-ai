import { NextResponse } from "next/server";
import { getJob, requestCancel } from "@/lib/runtime/jobs";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (SESSION_ENFORCED && !hasValidSession(req, {})) return NextResponse.json({ error: "Session required." }, { status: 401 });
  const job = getJob(id);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Job not found." }, { status: 404 });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (SESSION_ENFORCED && !hasValidSession(req, {})) return NextResponse.json({ error: "Session required." }, { status: 401 });
  const job = requestCancel(id);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Job not found." }, { status: 404 });
}
