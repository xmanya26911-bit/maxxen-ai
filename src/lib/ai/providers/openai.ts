import OpenAI from "openai";
import { openAICompatibleCapabilities } from "../capabilities";
import {
  ProviderError,
  type CapabilityDescriptor,
  type ModelEvent,
  type ModelRequest,
  type ProviderAdapter,
} from "../types";

/**
 * The OpenAI-compatible adapter: OpenAI, Gemini's OpenAI shim, and any custom
 * base URL. It wraps the EXACT request logic the routes used before, so BYOK,
 * streaming, custom endpoints and model selection are preserved.
 *
 * It is also the single construction point for the tool-calling client used by
 * the agent loop (`createOpenAICompatClient`), so the loop no longer builds an
 * SDK client itself — the seam is real, not cosmetic.
 */

/** Turn raw provider errors into actionable, credential-free hints. */
export function providerHintFor(e: unknown, status?: number): string {
  const raw = String((e as Error)?.message ?? e ?? "");
  if (
    status === 401 ||
    status === 403 ||
    /invalid api key|incorrect api key|unauthorized|invalid_api_key|authentication_error/i.test(raw)
  )
    return " — API key rejected. Re-paste the key for that provider in Settings.";
  if (status === 404 || /model_not_found|does not exist|invalid model|not_found/i.test(raw))
    return " — model ID unknown to that provider. Check the exact ID in Settings.";
  if (status === 429 || /rate.?limit|quota|overloaded/i.test(raw))
    return " — provider rate limit. Wait a bit or switch models.";
  if (/fetch failed|ENOTFOUND|ECONN|network|timeout/i.test(raw))
    return " — can't reach that Base URL. Check it in Settings.";
  return "";
}

/** Build the OpenAI-compatible SDK client (single construction point). */
export function createOpenAICompatClient(apiKey: string, baseURL: string): OpenAI {
  return new OpenAI({ apiKey, baseURL });
}

type OpenAIDeltaChunk = { choices: { delta?: { content?: string } }[] };

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  label: "◈ ChatGPT",
  defaultBaseURL: "https://api.openai.com/v1",

  capabilities(): CapabilityDescriptor {
    return openAICompatibleCapabilities();
  },

  supportsToolCalling(): boolean {
    return true;
  },

  async complete(request: ModelRequest): Promise<AsyncIterable<ModelEvent>> {
    const client = createOpenAICompatClient(request.apiKey, request.baseURL);

    // Establish the stream eagerly so immediate failures (auth/model) surface
    // before we start streaming — preserving the previous 502-on-failure UX.
    let gen: AsyncIterable<OpenAIDeltaChunk>;
    try {
      gen = (await client.chat.completions.create({
        model: request.model,
        messages: [
          ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
          ...request.messages,
        ] as unknown as Parameters<typeof client.chat.completions.create>[0]["messages"],
        temperature: request.temperature ?? 0.7,
        stream: true,
      })) as unknown as AsyncIterable<OpenAIDeltaChunk>;
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const base = e instanceof Error ? e.message : "Completion failed";
      throw new ProviderError(base + providerHintFor(e, status), status);
    }

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ModelEvent> {
        let sawAny = false;
        try {
          for await (const chunk of gen) {
            if (request.signal?.aborted) return;
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              sawAny = true;
              yield { type: "delta", text };
            }
          }
          if (!sawAny) {
            yield { type: "delta", text: "MAXXEN returned an empty response. Retry, or switch models." };
          }
        } catch (e) {
          if (request.signal?.aborted || (e as Error)?.name === "AbortError") return;
          yield { type: "delta", text: "\n\nConnection to the model dropped mid-answer." };
        }
        yield { type: "done" };
      },
    };
  },
};
