import { describe, it, expect } from "vitest";
import { assertSafeBaseURL } from "@/lib/net-guard";

describe("assertSafeBaseURL (SSRF guard)", () => {
  it("accepts public HTTPS URLs and strips a trailing slash", () => {
    expect(assertSafeBaseURL("https://api.openai.com/v1", "https://fallback")).toBe("https://api.openai.com/v1");
    expect(assertSafeBaseURL("https://api.openai.com/v1/", "https://fallback")).toBe("https://api.openai.com/v1");
    expect(assertSafeBaseURL("https://api.groq.com/openai/v1", "x")).toBe("https://api.groq.com/openai/v1");
  });

  it("falls back when input is empty or missing", () => {
    expect(assertSafeBaseURL("", "https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
    expect(assertSafeBaseURL(undefined, "https://example.com")).toBe("https://example.com");
  });

  it("rejects non-HTTPS schemes", () => {
    expect(() => assertSafeBaseURL("http://api.openai.com", "x")).toThrow();
    expect(() => assertSafeBaseURL("ftp://example.com", "x")).toThrow();
  });

  it("rejects embedded credentials", () => {
    expect(() => assertSafeBaseURL("https://user:pass@api.openai.com", "x")).toThrow();
  });

  it("rejects localhost and cloud metadata hosts", () => {
    for (const h of [
      "https://localhost",
      "https://metadata.google.internal",
      "https://instance-data",
      "https://169.254.169.254",
    ]) {
      expect(() => assertSafeBaseURL(h, "x")).toThrow();
    }
  });

  it("rejects private / loopback IPv4", () => {
    for (const h of [
      "https://127.0.0.1",
      "https://10.0.0.5",
      "https://192.168.1.1",
      "https://172.16.0.1",
      "https://0.0.0.0",
    ]) {
      expect(() => assertSafeBaseURL(h, "x")).toThrow();
    }
  });

  it("rejects IPv6 literals", () => {
    expect(() => assertSafeBaseURL("https://[::1]", "x")).toThrow();
    expect(() => assertSafeBaseURL("https://[2001:db8::1]", "x")).toThrow();
  });

  it("rejects single-label hosts and internal suffixes", () => {
    for (const h of ["https://intranet", "https://foo.local", "https://svc.internal", "https://api.lan"]) {
      expect(() => assertSafeBaseURL(h, "x")).toThrow();
    }
  });

  it("rejects numeric TLDs", () => {
    expect(() => assertSafeBaseURL("https://example.123", "x")).toThrow();
  });

  it("rejects unparseable URLs", () => {
    expect(() => assertSafeBaseURL("not a url", "x")).toThrow();
  });
});
