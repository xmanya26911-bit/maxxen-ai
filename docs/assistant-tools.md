# Assistant tools — time, web search, page reading, location

Provider-independent tools in `src/lib/tools.ts` (`get_current_time`,
`web_search`, `fetch_webpage`; kind `"local"`, always visible). Pure logic
lives in `src/lib/assistant-tools.ts`; tests in
`src/lib/__tests__/assistant-tools.test.ts` (mocked transports only).

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SEARXNG_BASE_URL` | only for web search | Base URL of a SearXNG instance, e.g. `http://localhost:8888` (self-host) or `https://search.example.com`. Read server-side only; the browser only learns whether one is set (`/api/assistant-tools/status`). |

Without it, `web_search` answers with a configuration message — never a
fabricated result. No other env is needed: time is native `Date`, page
reading needs no key, location is user-supplied.

## Local SearXNG (free, self-hosted)

```bash
docker run -d --name searxng -p 8888:8080 searxng/searxng:latest
```

Then set `SEARXNG_BASE_URL=http://localhost:8888`. The tool uses
`GET /search?q=…&format=json&language=en` (12s timeout, ≤10 results).
Note: stock SearXNG images ship with `format=json` enabled; if your instance
returns HTML, enable `search.formats: [html, json]` in its settings.

## Vercel deployment

Add `SEARXNG_BASE_URL` under Project → Settings → Environment Variables
(production). It must be reachable from Vercel's network — `localhost`
will not work there; use a hosted SearXNG or a small VPS. Redeploy after
changing env vars.

## Free-tier honesty

- Time, page reading, location: free forever (no external service).
- Web search is free **iff** the endpoint is — self-hosted SearXNG costs
  whatever its host costs (a $4–6 VPS or existing infra). Public SearXNG
  instances are volunteer-run: expect rate limits and downtime; the tool
  surfaces 429s and outages as plain messages with retry hints.

## Security & privacy

- SSRF: `assertSafeBaseURL` on the first URL **and every redirect hop**
  (manual redirects, max 3); localhost/private/cloud-metadata refused;
  DNS-rebinding residual is shared with `net-guard` (documented there).
- Responses capped (1.5MB fetch, 12k extracted chars), 12–15s timeouts,
  HTML-only (PDFs/feeds refused with a reason).
- No JS execution, no credentials sent to sites, page content labeled
  UNTRUSTED in tool output (data, never instructions).
- Location: browser geolocation only on explicit tap; coordinates stay in
  `localStorage` (never the vault/repo/logs); manual city alternative;
  revoke clears everything. No IP-geolocation fallback, ever.
- Search queries go only to the configured endpoint; queries are not logged
  by Maxxen (Vercel platform logs excluded from this guarantee).

## Local testing

```bash
npm test -- assistant-tools   # mocked transports, no network
npx tsc --noEmit && npm run lint && npm run build
```
