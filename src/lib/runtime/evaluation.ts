export interface EvalCase {
  id: string;
  category: "chat" | "coding" | "research" | "memory" | "tools" | "multimodal" | "deployment";
  prompt: string;
  requiredCapabilities?: string[];
  assertions: Array<(output: string) => boolean>;
}

export interface EvalResult {
  id: string;
  passed: boolean;
  assertionResults: boolean[];
  output: string;
  durationMs: number;
}

export async function runEvalCase(
  test: EvalCase,
  execute: (prompt: string) => Promise<string>
): Promise<EvalResult> {
  const started = Date.now();
  try {
    const output = await execute(test.prompt);
    const assertionResults = test.assertions.map((a) => {
      try { return Boolean(a(output)); } catch { return false; }
    });
    return { id: test.id, passed: assertionResults.every(Boolean), assertionResults, output, durationMs: Date.now() - started };
  } catch (error) {
    return { id: test.id, passed: false, assertionResults: test.assertions.map(() => false), output: error instanceof Error ? error.message : "Evaluation failed", durationMs: Date.now() - started };
  }
}

export function summarizeEvals(results: EvalResult[]) {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, failed: results.length - passed, passRate: results.length ? passed / results.length : 0 };
}
