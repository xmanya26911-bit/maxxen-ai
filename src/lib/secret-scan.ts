/**
 * Secret-leak guard — runs BEFORE any code is committed, pushed, saved, or
 * deployed through Maxxen tools. Catches obvious credential material so a
 * generated project can never smuggle keys into a repo or a deployment.
 *
 * Conservative by design: patterns target high-confidence secret shapes.
 * On a hit the write is REFUSED with a precise message (never the secret).
 */

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "OpenAI API key", re: /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { name: "GitHub token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Stripe key", re: /\b(sk_live|rk_live|pk_live)_[A-Za-z0-9_]{10,}\b/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Composio-style API key assignment", re: /\b(composio[_-]?key|COMPOSIO_API_KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}["']?/i },
  {
    name: "Generic secret assignment",
    re: /\b(api[_-]?key|api[_-]?secret|auth[_-]?token|access[_-]?token|secret[_-]?key|client[_-]?secret)\s*[:=]\s*["'][^"']{12,}["']/i,
  },
];

export interface SecretFinding {
  kind: string;
  line: number;
}

/** Scan text for credential material. Returns findings (empty = clean). */
export function scanForSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = String(content ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip the scan's own documentation patterns (self-match guard).
    if (line.includes("Secret-leak guard") || line.includes("PATTERNS")) continue;
    for (const p of PATTERNS) {
      // Reset stateful regexes.
      p.re.lastIndex = 0;
      if (p.re.test(line)) {
        findings.push({ kind: p.name, line: i + 1 });
        break;
      }
    }
    if (findings.length >= 5) break;
  }
  return findings;
}

/** Human-safe refusal message — describes WHAT and WHERE, never the secret. */
export function secretRefusal(findings: SecretFinding[], where: string): string {
  const detail = findings.map((f) => `${f.kind} (line ${f.line})`).join("; ");
  return (
    `Refused to write ${where}: possible credential material detected (${detail}). ` +
    `Remove the secret, use an environment variable instead, then retry. ` +
    `Nothing was saved or pushed.`
  );
}
