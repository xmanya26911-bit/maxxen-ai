import { describe, it, expect } from "vitest";
import { scanForSecrets } from "@/lib/secret-scan";

describe("scanForSecrets (leak guard)", () => {
  it("flags OpenAI-style keys", () => {
    expect(scanForSecrets('const k = "sk-abcdefghijklmnopqrstuvwx";').length).toBeGreaterThan(0);
    expect(scanForSecrets('const k = "sk-proj-abcdefghijklmnopqrstuvwx1234";').length).toBeGreaterThan(0);
  });

  it("flags Anthropic keys", () => {
    expect(scanForSecrets("key = 'sk-ant-abcdefghijklmnop'").length).toBeGreaterThan(0);
  });

  it("flags GitHub tokens", () => {
    expect(scanForSecrets("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789").length).toBeGreaterThan(0);
    expect(scanForSecrets("ghs_abcdefghijklmnopqrstuvwxyz0123456789").length).toBeGreaterThan(0);
  });

  it("flags Google and AWS keys", () => {
    expect(scanForSecrets(`const x = "AIza${"a".repeat(30)}";`).length).toBeGreaterThan(0);
    expect(scanForSecrets("AKIAABCDEFGHIJKLMNOP").length).toBeGreaterThan(0);
  });

  it("flags private-key blocks", () => {
    expect(scanForSecrets("-----BEGIN RSA PRIVATE KEY-----").length).toBeGreaterThan(0);
    expect(scanForSecrets("-----BEGIN OPENSSH PRIVATE KEY-----").length).toBeGreaterThan(0);
  });

  it("does not flag ordinary source code", () => {
    const clean = [
      "export function add(a: number, b: number) {",
      "  return a + b;",
      "}",
      "const apiKey = process.env.OPENAI_API_KEY;",
      "// fetch from the /v1/messages endpoint",
    ].join("\n");
    expect(scanForSecrets(clean)).toEqual([]);
  });

  it("does not flag short placeholder assignments", () => {
    expect(scanForSecrets('const apiKey = "short";')).toEqual([]);
    expect(scanForSecrets("const token = 42;")).toEqual([]);
  });

  it("reports the 1-based line number of the first finding", () => {
    const text = ["line one", "key: sk-abcdefghijklmnopqrstuvwx", "line three"].join("\n");
    const findings = scanForSecrets(text);
    expect(findings[0].line).toBe(2);
    expect(findings[0].kind).toBe("OpenAI API key");
  });
});
