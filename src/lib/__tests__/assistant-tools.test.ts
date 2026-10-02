import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  duplicateCallKey,
  extractReadableText,
  fetchWebpage,
  formatInTimezone,
  formatPageResult,
  formatSearchResults,
  isDuplicateCall,
  isValidTimezone,
  locationContextBlock,
  normalizeSearchResult,
  parseSearchResponse,
  resolveTimezone,
  sanitizeLocationPref,
  searchWeb,
  timeContextBlock,
} from "@/lib/assistant-tools";

/**
 * Assistant-tools tests. External services are mocked (fetchFn injection) —
 * no test depends on a public search instance being online.
 */

const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  process.env.SEARXNG_BASE_URL = "https://search.test";
});
afterEach(() => {
  delete process.env.SEARXNG_BASE_URL;
});

describe("current time", () => {
  it("formats Asia/Kolkata and rejects bad zones", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("x".repeat(61))).toBe(false);
    expect(resolveTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(resolveTimezone("nope", "UTC")).toBe("UTC");
    const d = new Date("2026-01-15T12:00:00.000Z");
    const l = formatInTimezone(d, "Asia/Kolkata");
    expect(l.date).toBe("2026-01-15");
    expect(l.time).toBe("17:30:00");
    expect(l.timezone).toBe("Asia/Kolkata");
    expect(l.weekday.length).toBeGreaterThan(0);
    expect(l.iso).toBe(d.toISOString());
  });

  it("context block always carries server UTC; local line only when valid", () => {
    const d = new Date("2026-01-15T12:00:00.000Z");
    expect(timeContextBlock(d)).toMatch(/server clock/);
    expect(timeContextBlock(d, "Asia/Kolkata")).toMatch(/Asia\/Kolkata/);
    expect(timeContextBlock(d, "nope")).not.toMatch(/User local/);
  });
});

describe("web search", () => {
  it("normalizes results and drops bad urls", () => {
    expect(normalizeSearchResult({ title: "T", url: "https://x.test/a", content: "S", publishedDate: "2026-01-01" })).toEqual({
      title: "T",
      url: "https://x.test/a",
      snippet: "S",
      published: "2026-01-01",
    });
    expect(normalizeSearchResult({ title: "T", url: "ftp://x/a" })).toBeNull();
    expect(normalizeSearchResult({ title: "", url: "https://x/a" })).toBeNull();
    expect(normalizeSearchResult(null)).toBeNull();
    expect(parseSearchResponse({ nope: 1 })).toEqual([]);
    expect(parseSearchResponse({ results: [{ title: "A", url: "https://a.test" }] })).toEqual([
      { title: "A", url: "https://a.test", snippet: "" },
    ]);
  });

  it("missing config gives a setup message, not a fake success", async () => {
    delete process.env.SEARXNG_BASE_URL;
    const r = await searchWeb("x", {
      fetchFn: (async () => {
        throw new Error("must not fetch");
      }) as typeof fetch,
    });
    expect("error" in r && /isn't configured/.test(r.error)).toBe(true);
  });

  it("queries the endpoint and caps results", async () => {
    let seen = "";
    const fetchFn = (async (url: unknown) => {
      seen = String(url);
      return json({ results: [1, 2, 3].map((i) => ({ title: `T${i}`, url: `https://x.test/${i}`, content: "S" })) });
    }) as typeof fetch;
    const r = await searchWeb("cbse announcement", { limit: 2, fetchFn });
    expect("results" in r && r.results.length).toBe(2);
    expect(seen).toMatch(/format=json/);
    expect(seen).toMatch(/cbse%20announcement/);
  });

  it("handles 429 and timeouts honestly", async () => {
    const r429 = await searchWeb("x", {
      fetchFn: (async () => new Response("slow", { status: 429 })) as typeof fetch,
    });
    expect("error" in r429 && /rate limit/i.test(r429.error)).toBe(true);
    const hanging = ((url: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => {
        const t = setTimeout(() => rej(new Error("hung")), 60000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      })) as typeof fetch;
    const r = await searchWeb("x", { fetchFn: hanging });
    expect("error" in r && /timed out/i.test(r.error)).toBe(true);
  }, 20000);

  it("formats genuine links only", () => {
    const s = formatSearchResults([{ title: "T", url: "https://x.test", snippet: "S", published: "2026" }]);
    expect(s).toMatch(/\[T\]\(https:\/\/x\.test\)/);
  });
});

describe("webpage reading", () => {
  const html = `<html><head><title>CBSE News</title><link rel="canonical" href="/news"><meta property="article:published_time" content="2026-03-01"></head><body><nav>menus</nav><script>evil()</script><article><h1>CBSE News</h1><p>Results declared today for all regions.</p></article><footer>copy</footer></body></html>`;
  const okFetch = (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;

  it("blocks internal targets", async () => {
    for (const u of ["http://localhost:9/x", "http://127.0.0.1/x", "http://169.254.169.254/x", "ftp://x.test/"]) {
      const r = await fetchWebpage(u, { fetchFn: okFetch });
      expect("error" in r, u).toBe(true);
    }
  });

  it("refuses redirect-to-private without leaking it", async () => {
    const evil = (async () =>
      new Response("", { status: 302, headers: { location: "http://169.254.169.254/meta" } })) as typeof fetch;
    const r = await fetchWebpage("https://x.test/a", { fetchFn: evil });
    expect("error" in r).toBe(true);
    expect(JSON.stringify(r)).not.toContain("169.254");
  });

  it("extracts readable text, drops chrome and scripts", async () => {
    const r = await fetchWebpage("https://x.test/news", { fetchFn: okFetch });
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.title).toBe("CBSE News");
      expect(r.url).toBe("https://x.test/news");
      expect(r.published).toBe("2026-03-01");
      expect(r.text).toMatch(/Results declared/);
      expect(r.text).not.toMatch(/evil|menus|copy/);
    }
  });

  it("rejects pdfs and oversized bodies", async () => {
    const pdf = (async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } })) as typeof fetch;
    const r1 = await fetchWebpage("https://x.test/f.pdf", { fetchFn: pdf });
    expect("error" in r1 && /Unsupported content/.test(r1.error)).toBe(true);
    const big = (async () => {
      const s = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(100)); c.close(); } });
      return new Response(s, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r2 = await fetchWebpage("https://x.test/b", { fetchFn: big, maxBytes: 10 });
    expect("error" in r2 && /too large/.test(r2.error)).toBe(true);
  });

  it("paywalls get an honest message; output is labeled untrusted", async () => {
    const walled = (async () => new Response("no", { status: 403 })) as typeof fetch;
    const r = await fetchWebpage("https://x.test/w", { fetchFn: walled });
    expect("error" in r && /paywall|login/i.test(r.error)).toBe(true);
    expect(formatPageResult({ title: "T", url: "https://x.test", text: "hi" })).toMatch(/UNTRUSTED/);
  });

  it("pure extractor never runs scripts", () => {
    const t = extractReadableText(`<p>Keep <b>this</b>.</p><script>alert(1)</script>`);
    expect(t).toMatch(/Keep this/);
    expect(t).not.toMatch(/alert/);
  });
});

describe("location prefs and call limits", () => {
  it("sanitizes prefs; disabled/empty yields no context", () => {
    expect(sanitizeLocationPref(null).enabled).toBe(false);
    expect(locationContextBlock(null)).toBe("");
    expect(locationContextBlock({ enabled: false, label: "Paris", source: "", updatedAt: "" })).toBe("");
    const p = sanitizeLocationPref({ enabled: true, label: "  Chennai  ", lat: 13.08, lon: 80.27, source: "browser" });
    expect(locationContextBlock(p)).toMatch(/Chennai/);
    expect(locationContextBlock(p)).toMatch(/13\.080/);
    expect(locationContextBlock({ enabled: true, label: "", source: "", updatedAt: "" })).toBe("");
  });

  it("duplicate-call keys are stable and exact", () => {
    const a = duplicateCallKey("web_search", { q: "x" });
    expect(isDuplicateCall(a, "web_search", { q: "x" }).duplicate).toBe(true);
    expect(isDuplicateCall(a, "web_search", { q: "y" }).duplicate).toBe(false);
    expect(isDuplicateCall(null, "web_search", { q: "x" }).duplicate).toBe(false);
  });
});
