# Maxxen AI — M-A-X-X-E-N + AI

Multipurpose agentic AI: chat + build websites/apps + plugins.
- **Hosting:** YOUR Vercel (`maxxen.vercel.app`)
- **Storage:** USER's GitHub repo `maxxen-data` (never owner's)
- **Plugins:** USER's Composio key → user connects gmail/github/notion/slack/vercel etc.
- **LLM:** BYOK — user pastes Gemini + ChatGPT keys + custom baseURL. Zero owner cost.
- **Auth:** Email OTP 6-digit from `maxxen.app@outlook.com` via SMTP.

## 1. Setup locally
```
npm install
cp .env.example .env.local
```
Fill OUTLOOK_EMAIL + OUTLOOK_PASSWORD in `.env.local` (gitignored, never commit).

Outlook note: normal password often blocked by MFA. Create an **App Password**: Microsoft Account → Security → Advanced → App passwords.

## 2. Deploy to YOUR Vercel
1. This repo is already in YOUR GitHub (`maxxen-ai`).
2. Vercel → New Project → Import this repo → Framework Next.js.
3. Env vars: `OUTLOOK_EMAIL`, `OUTLOOK_PASSWORD`, optional `COMPOSIO_API_KEY`.
4. Deploy → `maxxen.vercel.app`.

## 3. How user data flows
- Login OTP: server sends via Outlook SMTP, verifies code (10 min, 5 tries).
- Chat: browser sends BYOK key per-request to `/api/chat`. Key never saved server-side.
- Save: browser sends YOUR `githubToken` to `/api/github/save` → creates/fetches `maxxen-data` in YOUR account.
- Plugins: browser sends YOUR `composioKey` to `/api/composio/connect`. Connect toolkits at app.composio.dev.
- Hosting: YOUR `vercelToken` verified in `/api/vercel/deploy`.
