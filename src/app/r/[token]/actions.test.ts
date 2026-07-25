import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the DB seam, the session cookie I/O, and next/navigation redirect. ────
const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));
vi.mock("@/services/report-links", () => ({ resolveReportLink: resolveMock }));

const { grantMock, clearMock, bumpMock, currentMock } = vi.hoisted(() => ({
  grantMock: vi.fn(),
  clearMock: vi.fn(),
  bumpMock: vi.fn(),
  currentMock: vi.fn(async () => 0),
}));
vi.mock("@/lib/report-link-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/report-link-session")>();
  return {
    ...actual, // keep the REAL pure isAttemptCapReached / MAX_ATTEMPTS
    grantGateSession: grantMock,
    clearAttempts: clearMock,
    bumpAttempts: bumpMock,
    currentAttempts: currentMock,
  };
});

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // Next's redirect() throws to unwind; model that so we can assert it fired.
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { MAX_ATTEMPTS } from "@/lib/report-link-session";

import { submitAccessCode } from "./actions";

const TOKEN = "abc123def456abc123def456abc123de";
const CLIENT = "11111111-1111-1111-1111-111111111111";
const IDLE = { status: "idle" as const };

function form(code: string): FormData {
  const fd = new FormData();
  fd.set("code", code);
  return fd;
}

beforeEach(() => {
  resolveMock.mockReset();
  grantMock.mockReset();
  clearMock.mockReset();
  bumpMock.mockReset();
  currentMock.mockReset();
  redirectMock.mockClear();
  currentMock.mockResolvedValue(0);
});

describe("submitAccessCode (the gate server action)", () => {
  it("correct code → seals clientId + read grant into the cookie, clears attempts, redirects", async () => {
    resolveMock.mockResolvedValueOnce({ ok: true, clientId: CLIENT, readGrant: "grant-xyz-123" });

    await expect(submitAccessCode(TOKEN, IDLE, form("GOODCODE"))).rejects.toThrow(
      `REDIRECT:/r/${TOKEN}`,
    );

    // ⚠️ The grant minted by resolve is what the view later reads with — it MUST be
    // sealed into the (signed, httpOnly) cookie, never surfaced to the URL.
    expect(grantMock).toHaveBeenCalledWith(TOKEN, CLIENT, "grant-xyz-123");
    expect(clearMock).toHaveBeenCalledWith(TOKEN);
    expect(bumpMock).not.toHaveBeenCalled();
  });

  it("wrong code → generic invalid error, NO cookie set, attempt counted", async () => {
    resolveMock.mockResolvedValueOnce({ ok: false, reason: "invalid" });

    const state = await submitAccessCode(TOKEN, IDLE, form("WRONGON3"));

    expect(state).toEqual({ status: "invalid" });
    expect(grantMock).not.toHaveBeenCalled(); // ⚠️ no session on a failed code
    expect(bumpMock).toHaveBeenCalledWith(TOKEN);
  });

  it("locked link → lockout message, NO cookie, no further attempt bump", async () => {
    resolveMock.mockResolvedValueOnce({ ok: false, reason: "locked" });

    const state = await submitAccessCode(TOKEN, IDLE, form("WHATEVER"));

    expect(state).toEqual({ status: "locked" });
    expect(grantMock).not.toHaveBeenCalled();
    expect(bumpMock).not.toHaveBeenCalled();
  });

  it("blank code → generic invalid WITHOUT hitting the DB (no oracle, no wasted lockout)", async () => {
    const state = await submitAccessCode(TOKEN, IDLE, form("   "));

    expect(resolveMock).not.toHaveBeenCalled();
    expect(state).toEqual({ status: "invalid" });
    expect(bumpMock).toHaveBeenCalledWith(TOKEN);
  });

  it("app-layer cap reached → locked WITHOUT calling the DB (belt-and-suspenders)", async () => {
    currentMock.mockResolvedValueOnce(MAX_ATTEMPTS);

    const state = await submitAccessCode(TOKEN, IDLE, form("GOODCODE"));

    expect(state).toEqual({ status: "locked" });
    expect(resolveMock).not.toHaveBeenCalled();
    expect(grantMock).not.toHaveBeenCalled();
  });
});
