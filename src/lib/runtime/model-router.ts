import type { RuntimeCapabilities } from "./types";

export interface ModelCandidate {
  provider: string;
  model: string;
  capabilities: RuntimeCapabilities;
  contextTokens?: number;
  costScore?: number;
  latencyScore?: number;
  reliabilityScore?: number;
}

export interface RoutingNeed {
  vision?: boolean;
  tools?: boolean;
  structuredOutput?: boolean;
  reasoning?: boolean;
  longContext?: boolean;
  lowCost?: boolean;
}

function satisfies(c: RuntimeCapabilities, n: RoutingNeed) {
  if (n.vision && !c.vision) return false;
  if (n.tools && !c.toolCalling) return false;
  if (n.structuredOutput && !c.structuredOutput) return false;
  if (n.reasoning && !c.reasoning) return false;
  return true;
}

export function selectModel(candidates: ModelCandidate[], need: RoutingNeed): ModelCandidate | null {
  const eligible = candidates.filter((c) => satisfies(c.capabilities, need) && (!need.longContext || (c.contextTokens || 0) >= 32_000));
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => {
    const score = (x: ModelCandidate) =>
      (x.reliabilityScore ?? 0) * 5 + (x.latencyScore ?? 0) * 2 + (x.costScore ?? 0) * (need.lowCost ? 4 : 1) + (x.contextTokens || 0) / 100_000;
    return score(b) - score(a);
  })[0];
}
