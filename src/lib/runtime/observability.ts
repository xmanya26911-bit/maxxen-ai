export interface RunMetric {
  runId: string;
  userId?: string;
  projectId?: string;
  model?: string;
  provider?: string;
  intent?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls: number;
  retries: number;
  estimatedCost?: number;
  status: "running" | "completed" | "failed" | "cancelled";
  error?: string;
}

export function startMetric(input: Omit<RunMetric, "startedAt" | "status" | "toolCalls" | "retries">): RunMetric {
  return { ...input, startedAt: new Date().toISOString(), status: "running", toolCalls: 0, retries: 0 };
}

export function finishMetric(metric: RunMetric, status: RunMetric["status"], patch: Partial<RunMetric> = {}): RunMetric {
  const completedAt = new Date().toISOString();
  return {
    ...metric,
    ...patch,
    status,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(metric.startedAt)),
  };
}

export function estimateCost(inputTokens: number | undefined, outputTokens: number | undefined, inputPerMillion = 0, outputPerMillion = 0): number | undefined {
  if (inputTokens == null && outputTokens == null) return undefined;
  return ((inputTokens ?? 0) / 1_000_000) * inputPerMillion + ((outputTokens ?? 0) / 1_000_000) * outputPerMillion;
}
