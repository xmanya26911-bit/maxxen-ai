export type VerificationKind = "static" | "test" | "runtime" | "browser" | "deployment";

export interface VerificationResult {
  kind: VerificationKind;
  ok: boolean;
  summary: string;
  command?: string;
  url?: string;
  details?: unknown;
  timestamp: string;
}

export interface VerificationPlan {
  checks: Array<{ kind: VerificationKind; required: boolean; description: string }>;
}

export function defaultVerificationPlan(intent: string): VerificationPlan {
  const checks: VerificationPlan["checks"] = [
    { kind: "static", required: true, description: "Type/lint/import integrity" },
    { kind: "test", required: intent === "code", description: "Automated regression tests" },
  ];
  if (intent === "code" || intent === "create" || intent === "deploy") {
    checks.push({ kind: "runtime", required: true, description: "Application/API runtime smoke test" });
  }
  if (intent === "code" || intent === "create") {
    checks.push({ kind: "browser", required: true, description: "Rendered UI and browser console verification" });
  }
  if (intent === "deploy") {
    checks.push({ kind: "deployment", required: true, description: "Live deployment health check" });
  }
  return { checks };
}

export function allRequiredChecksPassed(results: VerificationResult[], plan: VerificationPlan): boolean {
  return plan.checks.filter((c) => c.required).every((c) => results.some((r) => r.kind === c.kind && r.ok));
}
