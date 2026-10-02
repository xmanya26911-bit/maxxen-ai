# MAXXEN Phase 1 — architecture audit + implementation map

Verified against remote `main` (read-only inspection of every subsystem
listed in PLANNINGIMPROVEMENT §1, plus recent commit history). Nothing below
is assumed — each claim names its file.

## Verified architecture map

```
Browser (ChatShell store + mirrors)
  │  { provider, baseURL, apiKey, model, userMemories, timezone, userLocation,
  │    githubToken, vercelToken, composioKey, memory(project), search prefs }
  ↓  POST (keys transit the server per request — see §45 note)
/api/chat ── adapterFor(provider).complete() ──► canonical MaxxenEvents (SSE)
/api/agent/run ── buildRuntime(ctx) ──► tool loop (OpenAI-compat client) ──► same events
          │
          ├─ lib/ai/{types,capabilities,providers/{registry,adapters,openai,anthropic,opencode,opencode-catalog}}
          ├─ lib/streaming/{types,events,encode,parse} (12 event types, client parser)
          ├─ lib/tools.ts (ToolDef registry + SCHEMAS + toOpenAITools; kinds project|deploy|composio|local)
          ├─ lib/user-memory/* + lib/memory.ts (project) + lib/assistant-tools.ts (time/search/fetch/location)
          ├─ lib/{net-guard,github-guard,secret-scan,security/guard (observe-only),context,sync,composio}
          └─ maxxen-data (user repo): builds/ chats/ memory/<project>.json memory/user/*.json settings.json vault
Settings: hub + endpoints/memory/integrations/tools pages (one SettingsForm, view prop)
Tests: vitest, src/lib/__tests__/*.test.ts, @/ alias configured
```

## 14-point findings (§1)

| # | Area | Verdict |
| --- | --- | --- |
| 1 | Duplication | chat/agent preambles resolve provider→URL→model independently (converge in Phase 2.1: `lib/ai/request.ts`). Memory `memoryBlock` vs user-memory block assembled in two places (converge next). |
| 2 | Abstractions | Provider seam + event protocol are sound; `resolveProvider`/`capabilitiesFor` honest. `Ctx` growing ad-hoc (timezone/location/search appended) — acceptable, typed. |
| 3 | Security | Guards solid (net/github/secret-scan, fixed memory paths, self-only repos, confirm-gating, no key logging seen in routes). Residuals already documented (DNS rebinding, Vercel platform logs). |
| 4 | Providers | OpenAI full; Anthropic chat-only (agent refuses — §6 work); Gemini via OpenAI shim; OpenCode 4 families, free tier gated upstream (documented, fail-closed); custom OpenAI-compat OK. |
| 5 | Streaming | Chat true-streams all families; agent loop streams text + tool deltas; parsers tolerate splits/malformed frames; abort paths end silently. No stuck-stream reports in code paths (cleanup in finally blocks). |
| 6 | Context | Char-budget (`context.ts` ~48k) + relevance top-K + caps — works but primitive (§11 work approved). |
| 7 | Persistence | Zustand localStorage only for chats; `chats/` exists in storage but no sync/search/branch (§13–14 approved). Memory has repo sync; chats do not. |
| 8 | UX | Hub + subpages consistent; message actions/confirm/tool-activity present; no global chat search, no edit/regenerate/branch, no citations UI (only markdown links). |
| 9 | Missing ChatGPT-class | Attachments/vision (§25/75) entirely absent; compaction (§12) absent; sources as objects (§69) absent; model selector shows no capabilities (§52). |
| 10 | Performance | Per-token markdown re-parse + persist-on-every-patch are the obvious hot spots (measure in §64, don't blindly optimize). |
| 11 | Dead code | None confirmed removed-worthy yet; `void` guards and legacy fallbacks are intentional compat. Re-audit per phase. |
| 12 | Brittle assumptions | Model-id string matches (`gpt-4o-mini` anthropic fallback, `mid ===` checks); `as any` casts in agent loop; em-dash/unicode in committed TS (fine) — but `*/` inside block comments broke a build before: keep the scanner rule (no `/*`/`*/` inside comments). |
| 13 | Frontend/backend drift | Endpoint/error copy drifted twice (OpenRouter removal, settings split) — fixed at the time. `CHAT_PROVIDERS` (constants) vs registry `PROVIDERS` is a second source of truth to converge. |
| 14 | Duplicate features | user-memory `buildMemoryBlock` vs project `memoryBlock` (converge); chat/agent system assembly (converge); settings FIELD/LABEL tokens copied per section file (acceptable, tiny). |

## §45 BYOK truthfulness — confirmed issue

Settings copy claims keys are "never sent anywhere except your provider"
(`settings-form.tsx` key hint). Reality: `ChatShell` POSTs `{...endpoint}`
(apiKey + baseURL + model) to `/api/chat` and `/api/agent/run` on
`maxxen.vercel.app`, which then calls the provider. Keys transit Maxxen's
server on every request (never stored server-side, never logged — verified),
but the copy as written is misleading. Fix in UX phase: reword to "stored
only in your browser and encrypted vault; requests relay through your Maxxen
server to the provider" + docs note. No code-flow change required.

## Preservation list (do-not-break)

`maxxen-data` layouts (chats/, memory/, vault, settings.json); route URLs;
env names (`SEARXNG_BASE_URL`, Gmail/Google OAuth, Composio); vault
pref/secret field names; memory JSON schema; canonical event types (additive
only); UI dark/glass language; confirm-gating semantics.

## Implementation map (phases 2–12, first steps)

- P2 runtime: 2.1 shared `lib/ai/request.ts` preamble (this phase) → 2.2
  unified system assembly → 2.3 RunPolicy (maxSteps/maxTools/timeouts) → 2.4
  chat-optional-tools.
- P3 providers: Anthropic native tools (§6) → Gemini native/Vision flags (§7)
  → OpenCode catalog refresh (§8) → custom capability overrides (§9) →
  ModelRouter resolveModel (§10).
- P4 context: token-aware budget → compaction → attachment summaries.
- P5 persistence: chats/ sync + search + branches (migrations per §84).
- P6 sources: Source objects + citationIds + Sources UI.
- P7 attachments: Attachment normalize → vision passthrough → PDF text.
- P8 workspace: versions/diff/preview hardening (exists — extend).
- P9 integrations: repo explorer summary, Vercel verify loop (exists — extend).
- P10 security/perf: audit + measure-first fixes + rate limits.
- P11 UX: message actions, shortcuts, activity design, §45 copy fix, privacy.
- P12 verify: vitest + tsc + lint + build + guided browser checklist (no
  browser available to the agent — owner runs §79).
