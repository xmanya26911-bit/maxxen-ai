import { describe, it, expect, beforeAll } from "vitest";
import { issueTicket, checkTicket, ticketFreshFor } from "@/lib/otp-crypto";

// Deterministic server secret for the signing primitive.
beforeAll(() => {
  process.env.OTP_SECRET = "test-secret-maxxen";
});

describe("otp tickets (HMAC + expiry + replay surface)", () => {
  it("accepts a valid ticket + code and proves freshness", () => {
    const t = issueTicket("user@example.com", "123456");
    expect(checkTicket(t, "user@example.com", "123456")).toBe(true);
    expect(ticketFreshFor(t, "user@example.com")).toBe(true);
  });

  it("rejects the wrong code", () => {
    const t = issueTicket("user@example.com", "123456");
    expect(checkTicket(t, "user@example.com", "000000")).toBe(false);
  });

  it("rejects a tampered email (bound to the issued address)", () => {
    const t = issueTicket("user@example.com", "123456");
    expect(checkTicket(t, "attacker@example.com", "123456")).toBe(false);
    expect(ticketFreshFor(t, "attacker@example.com")).toBe(false);
  });

  it("rejects an expired ticket (finite expiry)", () => {
    const t = issueTicket("user@example.com", "123456", -1000);
    expect(checkTicket(t, "user@example.com", "123456")).toBe(false);
    expect(ticketFreshFor(t, "user@example.com")).toBe(false);
  });

  it("rejects garbage and empty tickets", () => {
    expect(checkTicket("garbage", "user@example.com", "123456")).toBe(false);
    expect(checkTicket("", "user@example.com", "123456")).toBe(false);
    expect(ticketFreshFor("", "user@example.com")).toBe(false);
  });

  it("rejects a forged ticket that has a valid shape but a bad signature", () => {
    const forged = Buffer.from(`user@example.com|${Date.now() + 60000}|deadbeef|deadbeef`).toString("base64url");
    expect(checkTicket(forged, "user@example.com", "123456")).toBe(false);
    expect(ticketFreshFor(forged, "user@example.com")).toBe(false);
  });
});
