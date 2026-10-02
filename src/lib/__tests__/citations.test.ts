import { describe, it, expect } from "vitest";
import {
  buildSource,
  collectRunSources,
  domainOf,
  linkifyCitations,
  splitCitationMarkers,
} from "@/lib/citations";

describe("buildSource", () => {
  it("builds valid sources with domain + caps", () => {
    const s = buildSource("s1", { title: "T", url: "https://www.x.test/a", snippet: "S", publishedAt: "2026" });
    expect(s).toMatchObject({ id: "s1", domain: "x.test", kind: "snippet" });
    expect(buildSource("s1", { title: "", url: "https://x.test" })).toBeNull();
    expect(buildSource("s1", { title: "T", url: "ftp://x" })).toBeNull();
    expect(buildSource("s1", { title: "T", url: "nope" })).toBeNull();
    expect(domainOf("not a url")).toBe("");
  });

  it("collects search lists and single pages with stable ids", () => {
    const rs = collectRunSources("web_search", [{ title: "A", url: "https://a.test" }, { title: "", url: "x" }], 0);
    expect(rs.map((r) => r.id)).toEqual(["s1"]);
    expect(rs[0].kind).toBe("snippet");
    const pg = collectRunSources("fetch_webpage", { title: "P", url: "https://p.test", published: "2026-01-01" }, 2);
    expect(pg[0]).toMatchObject({ id: "s3", kind: "page", publishedAt: "2026-01-01" });
    expect(collectRunSources("other_tool", [{ title: "A", url: "https://a.test" }], 0)).toEqual([]);
  });
});

describe("citation markers", () => {
  it("splits refs from text", () => {
    expect(splitCitationMarkers("see [s1] and [s2] ok")).toEqual([
      { text: "see " },
      { ref: "s1" },
      { text: " and " },
      { ref: "s2" },
      { text: " ok" },
    ]);
    expect(splitCitationMarkers("plain")).toEqual([{ text: "plain" }]);
  });

  it("linkifies only resolved ids, never fabricates", () => {
    const srcs = [{ id: "s1", title: 'A "quoted"', url: "https://a.test", kind: "snippet" as const }];
    const out = linkifyCitations("read [s1] and [s9]", srcs);
    expect(out).toContain("[s1](https://a.test");
    expect(out).toContain("[s9]");
    expect(out).not.toContain("[s9](");
    expect(linkifyCitations("read [s1]", [])).toBe("read [s1]");
  });
});
