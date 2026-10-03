import { NextResponse } from "next/server";
import { newAgentRun } from "@/lib/runtime/events";
import { planForIntent } from "@/lib/runtime/agent-plan";
import { classifyIntent } from "@/lib/runtime/intent";
import { createJob } from "@/lib/runtime/jobs";
import { SESSION_ENFORCED, hasValidSession } from "@/lib/security/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { goal?: unknown; conversationId?: unknown; projectId?: unknown; model?: unknown; provider?: unknown; mode?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  if (SESSION_ENFORCED && !hasValidSession(req, body)) return NextResponse.json({ error: "Session required." }, { status: 401 });
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal) return NextResponse.json({ error: "goal is required." }, { status: 400 });
  const intent = classifyIntent(goal);
  const run = newAgentRun(goal, intent, {
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
    projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    provider: typeof body.provider === "string" ? body.provider : undefined,
  });
  run.tasks = planForIntent(intent, goal);
  run.status = "planning";
  const job = createJob(run);
  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    intent: job.intent,
    tasks: job.tasks,
    note: "Job metadata is created immediately. Connect this job to a durable worker/queue in production for execution after the request lifecycle.",
  }, { status: 202 });
}
