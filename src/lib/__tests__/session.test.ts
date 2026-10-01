import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession, SESSION_TTL_MS } from "@/lib/session";

beforeAll(() => {
  process.env.OTP_SECRET = "test-secret-maxxen";
});

describe("sessions (HMAC, self-expiring)", () => {
  it("round-trips a valid session and normalizes the email", () => {
    const t = signSession("User@Example.com");
    expect(verifySession(t)).toBe("user@example.com");
  });

  it("rejects an expired session", () => {
    const t = signSession("a@b.com", -1000);
    expect(verifySession(t)).toBeNull();
  });

  it("rejects a tampered email", () => {
    const t = signSession("a@b.com");
    const [email, exp, sig] = Buffer.from(t, "base64url").toString().split("|");
    expect(email).toBe("a@b.com");
    const tampered = Buffer.from(["c@d.com", exp, sig].join("|")).toString("base64url");
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects a tampered expiry", () => {
    const t = signSession("a@b.com");
    const [email, exp, sig] = Buffer.from(t, "base64url").toString().split("|");
    const tampered = Buffer.from([email, String(Number(exp) + 999_999), sig].join("|")).toString("base64url");
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects garbage and empty tokens", () => {
    expect(verifySession("")).toBeNull();
    expect(verifySession("not-a-session")).toBeNull();
    expect(verifySession("a|b|c|d")).toBeNull();
  });

  it("exposes the 30-day default TTL", () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
