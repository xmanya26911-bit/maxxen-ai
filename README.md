# Maxxen AI

Multipurpose agentic AI: chat plus build websites and apps plus plugins.
- Hosting: YOUR Vercel (maxxen.vercel.app)
- Storage: USER GitHub repo maxxen-data (never owner s)
- Plugins: USER Composio key for gmail github notion slack vercel etc.
- LLM: BYOK pasted keys plus custom baseURL. Zero owner cost.
- Auth: Email OTP 6-digit from Gmail SMTP plus optional Google OAuth.

Setup locally: npm install, copy .env.example to .env.local, fill GMAIL_EMAIL plus GMAIL_APP_PASSWORD (do NOT commit), npm run dev.

Required env in .env.local AND Vercel dashboard: GMAIL_EMAIL, GMAIL_APP_PASSWORD. Optional: OTP_SECRET, COMPOSIO_API_KEY, GOOGLE_CLIENT_ID.

Data flow: OTP via Gmail SMTP (10 min, rate-limited, single-use). Chat sends BYOK key per-request to /api/chat or /api/chat/stream. Save uses YOUR githubToken to maxxen-data in YOUR account. Plugins use YOUR composioKey. Hosting uses YOUR vercelToken via /api/vercel/deploy.

Security: never commit .env.local. npm test runs guard unit tests. npx tsc --noEmit stays clean.

Structure: app/chat is the 3-pane workspace. app/api/auth covers OTP plus Google plus session. app/api/chat plus app/api/agent/run cover BYOK chat, streaming, tool loop. app/api/github plus app/api/vault cover per-user storage. app/api/composio plus app/api/vercel cover plugins and deploys.
