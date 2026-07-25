import { describe, expect, it, vi } from "vitest";

// next/headers is imported by the module for its cookie-I/O helpers; the PURE
// sign/verify logic under test never calls it. Stub it so import is inert.
vi.mock("next/headers", () => ({ cookies: () => ({}) }));

import {
  MAX_ATTEMPTS,
  isAttemptCapReached,
  mintAttemptsValue,
  mintGateValue,
  readAttempts,
  readGateSession,
} from "./report-link-session";

const SECRET = "test-secret-please-ignore-000000000000000"; // ≥32 chars
const TOKEN = "abc123def456abc123def456abc123de";
const CLIENT = "11111111-1111-1111-1111-111111111111";
const GRANT = "deadbeefcafef00ddeadbeefcafef00d"; // the read grant carried in the cookie
const NOW = 1_780_000_000_000; // fixed instant (ms)
const HOUR = 60 * 60 * 1000;

describe("gate cookie — sign & read (pure)", () => {
  it("returns the bound clientId AND read grant for a fresh, unexpired cookie on its own token", () => {
    const value = mintGateValue(TOKEN, CLIENT, GRANT, NOW + 2 * HOUR, SECRET);
    expect(readGateSession(value, { token: TOKEN, now: NOW, secret: SECRET })).toEqual({
      clientId: CLIENT,
      grant: GRANT,
    });
  });

  it("rejects (null) an expired cookie (exp <= now)", () => {
    const value = mintGateValue(TOKEN, CLIENT, GRANT, NOW - 1, SECRET);
    expect(readGateSession(value, { token: TOKEN, now: NOW, secret: SECRET })).toBeNull();
  });

  it("rejects a cookie minted for a DIFFERENT token (scoped to one token)", () => {
    const value = mintGateValue(TOKEN, CLIENT, GRANT, NOW + HOUR, SECRET);
    expect(readGateSession(value, { token: "other-token", now: NOW, secret: SECRET })).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const value = mintGateValue(TOKEN, CLIENT, GRANT, NOW + HOUR, SECRET);
    const [body, sig] = value.split(".");
    const flipped = sig!.slice(0, -1) + (sig!.at(-1) === "A" ? "B" : "A");
    expect(
      readGateSession(`${body}.${flipped}`, { token: TOKEN, now: NOW, secret: SECRET }),
    ).toBeNull();
  });

  it("rejects a tampered payload (grant/clientId swapped without re-signing — the sig binds the body)", () => {
    const value = mintGateValue(TOKEN, CLIENT, GRANT, NOW + HOUR, SECRET);
    const sig = value.split(".")[1]!;
    // Re-encode a payload with a forged grant + client, keeping the original sig.
    const forgedBody = Buffer.from(
      JSON.stringify({
        t: TOKEN,
        c: "99999999-9999-9999-9999-999999999999",
        g: "forged-grant",
        e: NOW + HOUR,
      }),
    ).toString("base64url");
    expect(
      readGateSession(`${forgedBody}.${sig}`, { token: TOKEN, now: NOW, secret: SECRET }),
    ).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const value = mintGateValue(
      TOKEN,
      CLIENT,
      GRANT,
      NOW + HOUR,
      "a-completely-different-secret-000000000",
    );
    expect(readGateSession(value, { token: TOKEN, now: NOW, secret: SECRET })).toBeNull();
  });

  it("rejects empty / malformed values", () => {
    for (const bad of [undefined, "", "no-dot", ".", "body.", "not-base64.sig"]) {
      expect(readGateSession(bad, { token: TOKEN, now: NOW, secret: SECRET })).toBeNull();
    }
  });
});

describe("app-layer attempt counter (belt-and-suspenders over the DB lockout)", () => {
  it("round-trips a signed count", () => {
    const value = mintAttemptsValue(TOKEN, 3, SECRET);
    expect(readAttempts(value, { token: TOKEN, secret: SECRET })).toBe(3);
  });

  it("reads a tampered / unsigned count as 0 (defers to the authoritative DB lockout)", () => {
    expect(readAttempts("9.forged-signature", { token: TOKEN, secret: SECRET })).toBe(0);
    expect(readAttempts("9", { token: TOKEN, secret: SECRET })).toBe(0);
    expect(readAttempts(undefined, { token: TOKEN, secret: SECRET })).toBe(0);
  });

  it("reads a count signed for another token as 0", () => {
    const value = mintAttemptsValue("other", 4, SECRET);
    expect(readAttempts(value, { token: TOKEN, secret: SECRET })).toBe(0);
  });

  it("caps at MAX_ATTEMPTS", () => {
    expect(isAttemptCapReached(MAX_ATTEMPTS - 1)).toBe(false);
    expect(isAttemptCapReached(MAX_ATTEMPTS)).toBe(true);
    expect(isAttemptCapReached(MAX_ATTEMPTS + 5)).toBe(true);
  });
});
