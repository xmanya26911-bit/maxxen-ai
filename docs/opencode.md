# OpenCode provider integration

Maxxen talks to OpenCode **only** through OpenCode's documented public
inference API. `.opencode/` project configuration is handled separately and
never confers model access (see below).

> **`.opencode/` provides project configuration/context. It does not grant
> access to OpenCode-hosted models.**

## Endpoints used

Base: `https://opencode.ai` (pinned server-side; a client-supplied baseURL can
never redirect these calls).

| Purpose          | Endpoint                                              |
| ---------------- | ----------------------------------------------------- |
| Model discovery  | `GET /inference/v1/models` (public, no key)           |
| OpenAI Chat      | `POST /inference/openai/v1/chat/completions` (SSE)    |
| OpenAI Responses | `POST /inference/openai/v1/responses` (SSE)           |
| Anthropic        | `POST /inference/anthropic/v1/messages` (SSE)         |
| Gemini           | `POST /inference/google/v1beta/models/<m>:streamGenerateContent` (SSE) |

Why the inference family and not Zen (`/zen/…`)? The inference guide
(`opencode.ai/console/guides/inference`, `/v2/docs/console/inference`) is the
documented programmatic interface with a service-account key; Zen endpoints
are the TUI gateway. The Zen *model table* (`opencode.ai/docs/zen`) is still
used as the authoritative per-model **endpoint-family mapping**.

## Free-model discovery

The live `/v1/models` payload is a bare `{ data: [{ id }] }` list — no
free/paid flags, no family field, no capabilities. Enrichment
(`src/lib/ai/providers/opencode-catalog.ts`) applies the documented rules:

- **free** := id ends with `-free`, or id is in `FALLBACK_FREE_IDS`.
- **family** := `responses` for `gpt-`/`grok-`/`muse-spark-`; `anthropic` for
  `claude-`/`qwen`; `gemini` for `gemini-`; `unsupported` for `jev-`
  (`systemone` is not a documented public protocol — refused, not guessed);
  `openai-chat` otherwise.
- Capabilities are honest family-level facts only (`chat`, `streaming`).

Discovery behavior (`GET /api/opencode/models` → Settings picker):

1. Fetch live catalog (15s timeout), cache 1h.
2. One retry on 429/5xx, then serve stale cache if present.
3. Otherwise serve the versioned `FALLBACK_FREE_IDS` set (`FALLBACK_REV`)
   and label the response `"fallback"` so the UI never silently claims
   freshness. Refresh the fallback list whenever the docs change.

The picker therefore tracks OpenCode additions/removals with no release, and
a paid model can never be served under a "Free" label: `authRequired` comes
from the same predicate that gates the request.

## Authentication

Per the inference guide: **"Free chat models can be called without [an auth]
header. Paid models require it."**

- Free model selected → Maxxen sends **no** `Authorization` header and does
  not ask for a key (Settings shows the key field as optional).
- Paid model selected → the request carries the caller's own OpenCode key
  (`Bearer`, from Maxxen Settings → vault). Selecting a paid model with no
  key fails closed client-side *and* server-side before any request is sent.
- Maxxen never reads OpenCode credentials from anywhere else: no local
  credential stores, no session cookies, no installed-app databases, no
  fabricated keys. Only keys the user pasted into Maxxen are ever used.

## Architecture

```
Client (Settings picker / ChatShell)
  ↓  { provider: "opencode", model, apiKey? }   (key omitted for free models)
POST /api/chat  →  adapterFor("opencode")  →  opencodeAdapter.complete()
  ↓ ModelEvents (delta/error/done)
canonical MaxxenEvents (lib/streaming)  →  browser renders only text + metadata
```

- `src/lib/ai/providers/opencode-catalog.ts` — isomorphic: discovery, cache,
  family/free predicates, error normalizer. No SDKs, no secrets.
- `src/lib/ai/providers/opencode.ts` — server-only `ProviderAdapter`:
  pins endpoints, attaches the caller key only when required, forwards true
  SSE per family, enforces timeout (60s), honors cancellation, maps
  401/403/404/429/5xx to user-safe `ProviderError`s.
- Registered like every provider: `ProviderId` (`ai/types`) →
  `PROVIDERS` metadata (`ai/providers/registry`) → `ADAPTERS`
  (`ai/providers/adapters`). `endpoint.ts`, Settings tabs, and the vault key
  slot (`maxxen_apikey_opencode`) follow automatically.
- `/api/chat` resolves `provider: "opencode"` to the adapter and permits an
  empty key (the adapter itself enforces paid-model auth). All other
  providers are untouched.
- Agent loop: OpenCode chat-family models can drive tools (capability
  `toolCalling: true`, like every OpenAI-compatible endpoint). Responses /
  Anthropic / Gemini families report `toolCalling: false`, and the agent
  route additionally requires the chat family for OpenCode. Keyless agent
  runs are refused with an explicit message (the agent SDK client cannot omit
  the auth header, so free-keyless agent use stays a documented limitation —
  free chat works in `/chat`).

## `.opencode/` project support

`src/lib/project-context.ts` + `POST /api/project-context`:

- Detects `.opencode/` (and `.claude/`, `.cursor/`, `.windsurf/`,
  `.roo/`) in a repository listing — same detector, no duplication.
- Reads only allowlisted small text configs (`opencode.json`, `*.md`, …;
  50KB/file, 10 files, 200KB total). Credential names (`auth.json`,
  `credentials.json`, `*.key`, `.env`, …) are never fetched; traversal is
  rejected; nothing is executed or modified.
- The route is self-only (`owner` must equal the token's login) and returns
  agent-ready markdown. `POST /api/agent/run` accepts an optional
  `projectContext` string appended to the system prompt.
- Again: detecting `.opencode/` proves nothing about authentication and
  grants no model access.

## Adding a future model or API family

1. If the id follows the documented naming/family conventions, nothing is
   needed — discovery picks it up.
2. New family (e.g. a new Zen endpoint kind): add the URL + a
   starter/extractor in `opencode.ts`, extend `familyForModelId` +
   `OpenCodeApiFamily`, update the Zen-table reference in the catalog header.
3. New free ids while the catalog lacks flags: extend `FALLBACK_FREE_IDS`
   and bump `FALLBACK_REV`.
4. Add cases to `src/lib/__tests__/opencode.test.ts` (mock-server style —
   never the live service).

## Security decisions (summary)

- Documented endpoints only; fixed origin (no client redirect).
- Caller key only, header only when required; free calls are headerless.
- Paid-without-key fails closed in two layers (client gate + adapter throw).
- No credential harvesting of any kind; no subscription/rate-limit bypass
  (429s surface as retryable user errors; catalog retries once, then backs
  off to cache/fallback).
- Upstream bodies are truncated to 300 chars for messages; headers and keys
  never enter errors or logs.
- Project-context reads are allowlisted, capped, self-only repos, never
  executed.

## Validation

- `npm test` — `src/lib/__tests__/opencode.test.ts` (mock HTTP server, no
  live dependency) plus the existing suite.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` must stay green.
