import type { RuntimeIntent } from "./types";

const rules: Array<[RuntimeIntent, RegExp[]]> = [
  ["research", [/research|latest|look up|compare|sources|cite|news/i]],
  ["deploy", [/\bdeploy\b|publish|ship to vercel|production/i]],
  ["external_action", [/send email|post to|create issue|delete|invite|share|reply/i]],
  ["browser", [/open (the )?website|click|fill (the )?form|browser|scrape/i]],
  ["memory", [/remember|forget|what do you know about me|my preference/i]],
  ["data", [/csv|spreadsheet|excel|analy[sz]e data|plot|chart|statistics/i]],
  ["code", [/fix (the )?code|debug|typescript|javascript|react|next\.js|bug|build failed|implement/i]],
  ["create", [/create (a|an|the)|build (a|an|the)|make (a|an|the)|generate/i]],
];

export function classifyIntent(text: string): RuntimeIntent {
  const value = text.trim();
  if (!value) return "chat";
  for (const [intent, patterns] of rules) if (patterns.some((p) => p.test(value))) return intent;
  return "chat";
}

export function intentForMode(mode?: string): RuntimeIntent | null {
  switch ((mode || "").toLowerCase()) {
    case "research": return "research";
    case "code":
    case "build":
    case "design": return "code";
    case "deploy": return "deploy";
    case "agent": return "code";
    case "chat": return "chat";
    default: return null;
  }
}
