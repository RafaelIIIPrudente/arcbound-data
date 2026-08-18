import { beforeEach, describe, expect, it, vi } from "vitest";

const { setMock, revalidateMock, requireAdminMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  revalidateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));
vi.mock("@/services/clients", () => ({ setClientIndustryWriter: setMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import { setClientIndustryWriterAction } from "./industry-writer-actions";

const IDLE = { status: "idle" as const };
const CLIENT = "11111111-1111-1111-1111-111111111111";
const INDUSTRY = "22222222-2222-2222-2222-222222222222";
const WRITER_A = "33333333-3333-3333-3333-333333333333";
const WRITER_B = "44444444-4444-4444-4444-444444444444";

/**
 * Mirrors a real submit. ⚠️ BOTH FIELDS ARE ALWAYS PRESENT, because the form
 * always renders exactly one control for each — an unset one posts `""`, which
 * is how "not recorded" is spelled on the wire.
 */
function form(clientId: string, industryId: string, writerId: string): FormData {
  const fd = new FormData();
  fd.set("client_id", clientId);
  fd.set("industry_id", industryId);
  fd.set("writer_id", writerId);
  return fd;
}

const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  setMock.mockReset();
  setMock.mockResolvedValue(undefined);
  revalidateMock.mockReset();
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("setClientIndustryWriterAction", () => {
  it("⚠️ a writer-only change RE-SENDS the unchanged industry", async () => {
    // ⚠️ THIS IS THE SLICE. `set_client_industry_writer` applies BOTH arguments,
    // including NULL — there is no partial update. So a save that changes only
    // the writer must still carry the industry the Client already had, or that
    // industry is erased with no error and no trace.
    //
    // Asserted on the EXACT arguments, not on "the seam was called": the whole
    // defect is one argument being wrong while the call itself looks fine.
    await setClientIndustryWriterAction(IDLE, form(CLIENT, INDUSTRY, WRITER_B));

    expect(setMock).toHaveBeenCalledWith(CLIENT, INDUSTRY, WRITER_B);
  });

  it("⚠️ REFUSES a submission that omits a field, rather than clearing it", async () => {
    // A form that posts only what the admin touched is the silent wipe this file
    // exists to prevent. At this layer "absent" and "cleared" are indistinguishable
    // unless we refuse absence outright — so absence is a BUG REPORT, not a value.
    const fd = new FormData();
    fd.set("client_id", CLIENT);
    fd.set("writer_id", WRITER_B);
    // industry_id deliberately missing.

    const result = await setClientIndustryWriterAction(IDLE, fd);

    expect(result.status).toBe("error");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("sends an unset field as null, never as the empty string", async () => {
    await setClientIndustryWriterAction(IDLE, form(CLIENT, "", ""));

    expect(setMock).toHaveBeenCalledWith(CLIENT, null, null);
  });

  it("clearing only the writer keeps the industry", async () => {
    await setClientIndustryWriterAction(IDLE, form(CLIENT, INDUSTRY, ""));

    expect(setMock).toHaveBeenCalledWith(CLIENT, INDUSTRY, null);
  });

  it("clearing only the industry keeps the writer", async () => {
    await setClientIndustryWriterAction(IDLE, form(CLIENT, "", WRITER_A));

    expect(setMock).toHaveBeenCalledWith(CLIENT, null, WRITER_A);
  });

  it("validates every id before the seam", async () => {
    const result = await setClientIndustryWriterAction(IDLE, form(CLIENT, "not-a-uuid", WRITER_A));

    expect(result.status).toBe("error");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("saves and revalidates the client's overview", async () => {
    const result = await setClientIndustryWriterAction(IDLE, form(CLIENT, INDUSTRY, WRITER_A));

    expect(result.status).toBe("saved");
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.details(CLIENT));
  });

  it("⚠️ requireAdmin() runs FIRST and its redirect ESCAPES", async () => {
    // ⚠️ Next's `redirect()` denies by THROWING. Inside a try/catch it would be
    // caught and rendered as a form message reading "NEXT_REDIRECT" — the guard
    // silently disabled. This repo has shipped that bug once already.
    requireAdminMock.mockRejectedValue(REDIRECT());

    await expect(
      setClientIndustryWriterAction(IDLE, form(CLIENT, INDUSTRY, WRITER_A)),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("surfaces the database's refusal verbatim", async () => {
    setMock.mockRejectedValue(new Error("admin role required"));

    const result = await setClientIndustryWriterAction(IDLE, form(CLIENT, INDUSTRY, WRITER_A));

    expect(result).toEqual({ status: "error", message: "admin role required" });
  });
});
