import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: mock the S1 service seam + next/cache. Nothing hits the DB.
const { issueMock, rotateMock, revokeMock, revalidateMock, requireAdminMock } = vi.hoisted(() => ({
  issueMock: vi.fn(),
  rotateMock: vi.fn(),
  revokeMock: vi.fn(),
  revalidateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));
vi.mock("@/services/report-links", () => ({
  issueReportLink: issueMock,
  rotateReportLink: rotateMock,
  revokeReportLink: revokeMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

/**
 * What `requireAdmin()` actually does to a non-admin: it calls `redirect()`,
 * which NEVER returns — it throws a control-flow signal. Modelling the throw is
 * the whole point of these tests; see the "refuses a non-admin" block below.
 */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

import { paths } from "@/paths";

import {
  createReportLinkAction,
  revokeReportLinkAction,
  rotateReportLinkAction,
} from "./report-link-actions";

const CLIENT = "11111111-1111-1111-1111-111111111111";
const IDLE = { status: "idle" as const };
const fd = () => new FormData();

beforeEach(() => {
  issueMock.mockReset();
  rotateMock.mockReset();
  revokeMock.mockReset();
  revalidateMock.mockReset();
  // Default: the caller IS an admin, so every pre-existing test below keeps
  // asserting exactly what it asserted before the role boundary existed.
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("createReportLinkAction", () => {
  it("issues a link, surfaces the one-time code, and revalidates the client page", async () => {
    issueMock.mockResolvedValueOnce({ url: "https://x/r/tok", accessCode: "K7QMR4TX" });

    const state = await createReportLinkAction(CLIENT, IDLE, fd());

    expect(issueMock).toHaveBeenCalledWith(CLIENT);
    expect(state).toEqual({
      status: "issued",
      link: { url: "https://x/r/tok", accessCode: "K7QMR4TX" },
    });
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.details(CLIENT));
  });

  it("returns an error state (never throws) when the service fails", async () => {
    issueMock.mockRejectedValueOnce(new Error("already has an active link"));
    const state = await createReportLinkAction(CLIENT, IDLE, fd());
    expect(state.status).toBe("error");
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("rotateReportLinkAction", () => {
  it("rotates, surfaces the fresh one-time code, and revalidates", async () => {
    rotateMock.mockResolvedValueOnce({ url: "https://x/r/new", accessCode: "NEW23456" });

    const state = await rotateReportLinkAction(CLIENT, IDLE, fd());

    expect(rotateMock).toHaveBeenCalledWith(CLIENT);
    expect(state).toEqual({
      status: "issued",
      link: { url: "https://x/r/new", accessCode: "NEW23456" },
    });
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.details(CLIENT));
  });
});

describe("revokeReportLinkAction", () => {
  it("revokes and revalidates so the card flips back to Create", async () => {
    revokeMock.mockResolvedValueOnce(undefined);

    const state = await revokeReportLinkAction(CLIENT, IDLE, fd());

    expect(revokeMock).toHaveBeenCalledWith(CLIENT);
    expect(state).toEqual({ status: "revoked" });
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.details(CLIENT));
  });

  it("returns an error state when revoke fails", async () => {
    revokeMock.mockRejectedValueOnce(new Error("boom"));
    const state = await revokeReportLinkAction(CLIENT, IDLE, fd());
    expect(state.status).toBe("error");
  });
});

describe("every Report Link action refuses a non-admin (ADR 0013)", () => {
  // ⚠️ THE ASSERTION THAT MATTERS IS `not.toHaveBeenCalled()`, NOT THE THROWN ERROR.
  //
  // "It returned an error" would also be satisfied by an action that issued the
  // link and THEN failed. These assert the service seam was never reached at all —
  // the refusal happens BEFORE any work, so nothing is minted, rotated, or revoked
  // on the way to being denied.
  const cases = [
    { name: "createReportLinkAction", run: createReportLinkAction, service: issueMock },
    { name: "rotateReportLinkAction", run: rotateReportLinkAction, service: rotateMock },
    { name: "revokeReportLinkAction", run: revokeReportLinkAction, service: revokeMock },
  ];

  it.each(cases)("$name never reaches the service for a non-admin", async ({ run, service }) => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(run(CLIENT, IDLE, fd())).rejects.toThrow("NEXT_REDIRECT");

    expect(service).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it.each(cases)("$name lets the redirect ESCAPE rather than catching it", async ({ run }) => {
    // ⚠️ THE REDIRECT MUST NOT BE SWALLOWED BY THE ACTION'S try/catch.
    //
    // These actions catch everything and return `{status: "error"}`. `redirect()`
    // signals by THROWING, so a `requireAdmin()` placed inside that try would be
    // caught, converted into an error message, and the redirect would never
    // happen — the user would sit on the page reading "NEXT_REDIRECT" as if it
    // were a server fault. That is why the guard is the first statement BEFORE
    // the try. This test fails the moment someone moves it inside.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    const outcome = await run(CLIENT, IDLE, fd()).then(
      (state) => ({ kind: "returned" as const, state }),
      (err: unknown) => ({ kind: "threw" as const, err }),
    );

    expect(outcome.kind).toBe("threw");
  });
});
