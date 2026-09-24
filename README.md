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
# fill GMAIL_EMAIL=xmanya26911@gmail.com
# fill GMAIL_APP_PASSWORD=app-password (do NOT commit!)
npm run dev
```

Gmail SMTP setup (REQUIRED):
1. Sign in to the sender Gmail → Google Account → Security → enable 2-Step Verification.
2. Same page → App passwords → create one (name `Maxxen AI`) → copy the 16-letter code (spaces don't matter).
3. Set `GMAIL_EMAIL` to the address and `GMAIL_APP_PASSWORD` to the code in `.env.local` AND in Vercel → maxxen → Environment Variables. Redeploy after changing Vercel env.

## 2. Deploy to YOUR Vercel
1. Push `Maxxen AI` folder to YOUR GitHub.
2. Vercel → New Project → Import → Framework Next.js.
3. Env vars: `OUTLOOK_EMAIL`, `OUTLOOK_PASSWORD`, optional `COMPOSIO_API_KEY`.
4. Deploy → `maxxen.vercel.app`.

## 3. How user data flows
- Login OTP: server sends via Outlook SMTP, verifies code (10 min, 5 tries).
- Chat: browser sends BYOK key per-request to `/api/chat`. Key never saved server-side.
- Save: browser sends YOUR `githubToken` to `/api/github/save` → creates/fetches `maxxen-data` in YOUR account.
- Plugins: browser sends YOUR `composioKey` to `/api/composio/connect`. Connect toolkits at app.composio.dev.
- Hosting: YOUR `vercelToken` verified in `/api/vercel/deploy`.

## 4. Security — IMPORTANT
- Never commit `.env.local`. The Outlook password you shared must go ONLY in Vercel env vars, never in code.
- Rotate it now that it was shared in chat. Use an App Password.
- For production scale replace in-memory OTP with Upstash Redis/Vercel KV.

## Structure
app/page.tsx = full UI (auth+chat+builder+plugins+storage+hosting+settings)
app/api/auth/send-otp, verify-otp = OTP system
app/api/chat = BYOK OpenAI/Gemini
app/api/github/save = per-user GitHub storage
app/api/composio/connect = per-user Composio
app/api/vercel/deploy = per-user Vercel check
