import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: mock the S1 service seam + next/cache. Nothing hits the DB.
const { issueMock, rotateMock, revokeMock, revalidateMock } = vi.hoisted(() => ({
  issueMock: vi.fn(),
  rotateMock: vi.fn(),
  revokeMock: vi.fn(),
  revalidateMock: vi.fn(),
}));
vi.mock("@/services/report-links", () => ({
  issueReportLink: issueMock,
  rotateReportLink: rotateMock,
  revokeReportLink: revokeMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

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
