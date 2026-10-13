# Maxxen AI

A BYOK (bring-your-own-key) AI development workspace. Chat with an agent loop that can read and write files, search the web, create GitHub repositories, and deploy sites — all using **your own** provider keys, GitHub token, Vercel token and Composio key.

## What it does

- **Chat + agent loop** (`/api/chat`, `/api/agent/run`): OpenAI-compatible and Anthropic adapters, tool calling, streaming events, citations.
- **GitHub-native storage**: every user gets their own `maxxen-data` repo (builds, chats, settings, checkpoints, memory). Path-allowlisted writes only.
- **Deploys**: static sites ship to the user's own Vercel account (`/api/vercel/deploy`), with live status polling.
- **Composio tools**: run connected SaaS actions from chat (`/api/composio/*`), destructive actions require explicit confirmation.
- **Auth**: email OTP via Gmail (stateless HMAC tickets) or Google sign-in; sessions are short-lived HMAC tokens.

## Stack

Next.js 16 (App Router, `output: "standalone"`), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Vitest.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in what you need
npm run dev                  # http://localhost:3000
```

Environment variables are documented in [`.env.example`](.env.example). Provider/API keys are primarily entered in the UI (Settings) and stored client-side or in the user's encrypted vault — the server only relays them to the provider for each request.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | dev server on port 3000 |
| `npm run build` | production build + copy assets into `.next/standalone` (portable, `scripts/postbuild.mjs`) |
| `npm start` | run the standalone server |
| `npm run lint` | ESLint |
| `npm test` | full Vitest suite |

## Security notes

- Every credential-bearing API route requires a signed session (`lib/security/guard.ts`); route-level regression tests live in `src/lib/__tests__/routes-auth.test.ts`.
- Model-supplied `confirm` arguments are stripped; only an explicit human "Confirmed: \<tool\>" message authorizes protected actions. `centralPermissionGate` backstops deploy/destructive-external calls before any tool runs.
- Custom base URLs are SSRF-guarded (`lib/net-guard.ts`): https-only, no credentials, public hosts only, default port only.
- OTP codes are rate-limited per email and per IP, compared in constant time, and single-use per ticket.

More detail: [`docs/audit-phase1.md`](docs/audit-phase1.md) (internal audit), [`docs/worklog.md`](docs/worklog.md) (development log).
