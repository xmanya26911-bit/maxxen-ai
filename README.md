# Maxxen AI — M-A-X-X-E-N + AI

Multipurpose agentic AI: chat + build websites/apps + plugins.
- **Hosting:** YOUR Vercel (`maxxen.vercel.app`)
- **Storage:** USER's GitHub repo `maxxen-data` (never owner's)
- **Plugins:** USER's Composio key → user connects gmail/github/notion/slack/vercel etc.
- **LLM:** BYOK — user pastes Gemini + ChatGPT keys + custom baseURL. Zero owner cost.
- **Auth:** Email OTP 6-digit from Gmail SMTP (Google App Password).

## 1. Setup locally
```bash
npm install
cp .env.example .env.local
# fill GMAIL_EMAIL + GMAIL_APP_PASSWORD (do NOT commit!)
npm run dev
```

## 2. Required env (local `.env.local` AND Vercel dashboard)
- `GMAIL_EMAIL`, `GMAIL_APP_PASSWORD` (Google App Password, 2-Step Verification on)
- Optional: `OTP_SECRET`, `COMPOSIO_API_KEY`, `GOOGLE_CLIENT_ID` (+ `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)

## 3. How user data flows
- Login OTP: server sends via Gmail SMTP, verifies code (10 min, rate-limited, single-use tickets).
- Chat: browser sends BYOK key per-request to `/api/chat` or `/api/chat/stream`. Key never saved server-side.
- Save: browser sends YOUR `githubToken` to `/api/github/save` → `maxxen-data` in YOUR account.
- Plugins: browser sends YOUR `composioKey`. Connect toolkits at app.composio.dev.
- Hosting: YOUR `vercelToken` deploys to YOUR project via `/api/vercel/deploy`.

## 4. Security
- Never commit `.env.local`. Secrets stay in env vars, never in code.
- `npm test` runs guard unit tests (27 passing). `npx tsc --noEmit` must stay clean.

## Structure
- `app/chat` — 3-pane workspace (sidebar, conversation, inspector)
- `app/api/auth/*` — OTP + Google + session
- `app/api/chat/*`, `app/api/agent/run` — BYOK chat, streaming, tool loop
- `app/api/github/*`, `app/api/vault/*` — per-user storage
- `app/api/composio/*`, `app/api/vercel/*` — plugins and deploys