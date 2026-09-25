/**
 * BYOK endpoint storage — one API key PER PROVIDER.
 *
 * Switching Gemini → ChatGPT no longer overwrites (or leaks into) the other
 * provider's key: each lives under `maxxen_apikey_<provider>`. The legacy
 * single `maxxen_apikey` key is still honored as a read-only fallback so
 * existing installs keep working (adopted into the current provider on
 * first Settings save).
 */

export const PROVIDER_IDS = ["openai", "anthropic", "gemini", "custom"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_META: Record<ProviderId, { label: string; baseURL: string; model: string; keyHint: string }> = {
  openai: {
    label: "◈ ChatGPT",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyHint: "sk-… from platform.openai.com/api-keys",
  },
  anthropic: {
    label: "✶ Claude",
    baseURL: "https://api.anthropic.com",
    model: "claude-3-5-haiku-latest",
    keyHint: "sk-ant-… from console.anthropic.com",
  },
  gemini: {
    label: "⬢ Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-1.5-flash",
    keyHint: "AIza… from aistudio.google.com",
  },
  custom: {
    label: "Custom",
    baseURL: "",
    model: "",
    keyHint: "as issued by your provider",
  },
};

export function normalizeProvider(raw: unknown): ProviderId {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (PROVIDER_IDS as readonly string[]).includes(v) ? (v as ProviderId) : "custom";
}

/** localStorage key holding THIS provider's API key. */
export function providerKeyName(provider: ProviderId): string {
  return `maxxen_apikey_${provider}`;
}

export interface Endpoint {
  provider: ProviderId;
  baseURL: string;
  apiKey: string;
  model: string;
}

function lsGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Read the current endpoint (per-provider key, legacy single key as fallback). */
export function getEndpoint(): Endpoint | null {
  if (typeof window === "undefined") return null;
  const provider = normalizeProvider(window.localStorage.getItem("maxxen_provider"));
  const baseURL = lsGet("maxxen_baseurl");
  const model = lsGet("maxxen_model");
  const apiKey = lsGet(providerKeyName(provider)) || lsGet("maxxen_apikey");
  if (!apiKey.trim() || !model.trim()) return null;
  return { provider, baseURL, apiKey: apiKey.trim(), model: model.trim() };
}

/** Persist one provider's key immediately (used as the user types/saves). */
export function setProviderKey(provider: ProviderId, apiKey: string): void {
  try {
    window.localStorage.setItem(providerKeyName(provider), apiKey);
  } catch {
    /* quota — settings save retries */
  }
}

/** Read one provider's stored key (legacy fallback included). */
export function getProviderKey(provider: ProviderId): string {
  return lsGet(providerKeyName(provider)) || lsGet("maxxen_apikey");
}

/** Which providers currently hold a key (for status dots). */
export function providersWithKeys(): ProviderId[] {
  return PROVIDER_IDS.filter((p) => getProviderKey(p).trim().length > 0);
}
