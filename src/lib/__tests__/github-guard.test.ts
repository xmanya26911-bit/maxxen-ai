import { describe, it, expect } from "vitest";
import { cleanGithubPath } from "@/lib/github-guard";

describe("cleanGithubPath (path-traversal guard)", () => {
  it("allows the repo root only in list mode", () => {
    expect(cleanGithubPath("", { allowRoot: true })).toBe("");
    expect(cleanGithubPath("", {})).toBeNull();
  });

  it("allows files under builds/ and chats/", () => {
    expect(cleanGithubPath("builds/site/index.html")).toBe("builds/site/index.html");
    expect(cleanGithubPath("chats/abc.json")).toBe("chats/abc.json");
    expect(cleanGithubPath("settings.json")).toBe("settings.json");
  });

  it("rejects traversal and slash abuse", () => {
    expect(cleanGithubPath("../secrets.json")).toBeNull();
    expect(cleanGithubPath("builds/../../etc/passwd")).toBeNull();
    expect(cleanGithubPath("builds//x.html")).toBeNull();
    expect(cleanGithubPath("builds/site/")).toBeNull();
  });

  it("rejects hidden .github / .git paths", () => {
    expect(cleanGithubPath(".github/workflows/ci.yml")).toBeNull();
    expect(cleanGithubPath(".git/config")).toBeNull();
  });

  it("rejects absolute / leading-slash paths", () => {
    expect(cleanGithubPath("/etc/passwd")).toBeNull();
  });

  it("rejects writes outside the allowlist", () => {
    expect(cleanGithubPath("src/index.ts")).toBeNull();
    expect(cleanGithubPath("README.md")).toBeNull();
  });

  it("rejects overlong paths", () => {
    expect(cleanGithubPath("builds/" + "a".repeat(300))).toBeNull();
  });

  it("handles non-string input", () => {
    expect(cleanGithubPath(42 as unknown)).toBeNull();
    expect(cleanGithubPath(42 as unknown, { allowRoot: true })).toBe("");
  });
});
