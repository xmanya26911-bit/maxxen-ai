# OpenCode provider integration

Maxxen talks to OpenCode **only** through OpenCode's documented public
inference API. `.opencode/` project configuration is handled separately and
never confers model access (see below).

> **`.opencode/` provides project configuration/context. It does not grant
> access to OpenCode-hosted models.**

## Free-tier restriction (upstream gate, 2026-09-16)

Since 2026-09-16 OpenCode rejects free-tier calls from outside the official
OpenCode client: `403 {"error":{"type":"FreeTierError","message":"OpenCode's
free tier can only be used from within OpenCode"}}` — even with a valid
account key (anomalyco/opencode#49433, #49596, #49609; the gate reads the
client identity, which third parties cannot legitimately present).
Faking the client to dodge the gate would be impersonation, so Maxxen does
not attempt it. Consequences in Maxxen:

- **Every OpenCode model requires the caller's own OpenCode key** (paid
  models). Keyless calls fail closed before any request is sent.
- The Settings model browser was removed: it advertised free models Maxxen
  cannot serve. Type the paid model ID manually.
- A 403 carrying `FreeTierError` is surfaced verbatim in meaning: "free
  tier only works inside the official OpenCode app".
- If upstream re-opens free access, relax `modelNeedsKey` in
  `opencode-catalog.ts` (it is a function for exactly this reason).

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

Discovery behavior (`GET /api/opencode/models`):

1. Fetch live catalog (15s timeout), cache 1h.
2. One retry on 429/5xx, then serve stale cache if present.
3. Otherwise serve the versioned `FALLBACK_FREE_IDS` set (`FALLBACK_REV`)
   and label the response `"fallback"` so the UI never silently claims
   freshness. Refresh the fallback list whenever the docs change.

`authRequired` is currently true for every model (see restriction above);
the `free` label remains informational only and is never used to skip auth.

## Authentication

- **Every OpenCode model needs the caller's own key** (`Bearer`, from
  Maxxen Settings → vault). No key → fail closed, no request sent.
- Maxxen never reads OpenCode credentials from anywhere else: no local
  credential stores, no session cookies, no installed-app databases, no
  fabricated keys, no client spoofing. Only keys the user pasted into
  Maxxen are ever used.

## Architecture

```
Client (Settings / ChatShell)
  ↓  { provider: "opencode", model, apiKey }   (key always required)
POST /api/chat  →  adapterFor("opencode")  →  opencodeAdapter.complete()
  ↓ ModelEvents (delta/error/done)
canonical MaxxenEvents (lib/streaming)  →  browser renders only text + metadata
```

- `src/lib/ai/providers/opencode-catalog.ts` — isomorphic: discovery, cache,
  family/free predicates, error normalizer. No SDKs, no secrets.
- `src/lib/ai/providers/opencode.ts` — server-only `ProviderAdapter`:
  pins endpoints, attaches the caller key on every call, forwards true
  SSE per family, enforces timeout (60s), honors cancellation, maps
  401/403/404/429/5xx to user-safe `ProviderError`s.
- Registered like every provider: `ProviderId` (`ai/types`) →
  `PROVIDERS` metadata (`ai/providers/registry`) → `ADAPTERS`
  (`ai/providers/adapters`). `endpoint.ts`, Settings tabs, and the vault key
  slot (`maxxen_apikey_opencode`) follow automatically.
- `/api/chat` requires a key for every provider including OpenCode; the
  adapter enforces it again per model. All other providers are untouched.
- Agent loop: OpenCode chat-family models can drive tools (capability
  `toolCalling: true`, like every OpenAI-compatible endpoint), with the
  caller key mandatory. Responses / Anthropic / Gemini families report
  `toolCalling: false`, and the agent route additionally requires the chat
  family for OpenCode.

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
2. New family (e.g. a new Zen endpoint kind): add the URL +
   starter/extractor in `opencode.ts`, extend `familyForModelId` +
   `OpenCodeApiFamily`, update the Zen-table reference in the catalog header.
3. New free ids while the catalog lacks flags: extend `FALLBACK_FREE_IDS`
   and bump `FALLBACK_REV`.
4. Add cases to `src/lib/__tests__/opencode.test.ts` (mock-server style —
   never the live service).

## Security decisions (summary)

- Documented endpoints only; fixed origin (no client redirect).
- Caller key on every call; no anonymous requests of any kind.
- Missing key fails closed in two layers (route gate + adapter throw).
- No credential harvesting of any kind; no client impersonation to dodge
  the free-tier gate; no subscription/rate-limit bypass (429s surface as
  retryable user errors; catalog retries once, then backs off to
  cache/fallback).
- Upstream bodies are truncated to 300 chars for messages; headers and keys
  never enter errors or logs.
- Project-context reads are allowlisted, capped, self-only repos, never
  executed.

## Validation

- `npm test` — `src/lib/__tests__/opencode.test.ts` (mock HTTP server, no
  live dependency) plus the existing suite.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` must stay green.
