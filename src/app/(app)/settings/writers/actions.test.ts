import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the seam, next/cache and the role guard are mocked.
const { createMock, updateMock, statusMock, deleteMock, revalidateMock, requireAdminMock } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    updateMock: vi.fn(),
    statusMock: vi.fn(),
    deleteMock: vi.fn(),
    revalidateMock: vi.fn(),
    requireAdminMock: vi.fn(),
  }));
vi.mock("@/services/writers", () => ({
  createWriter: createMock,
  updateWriter: updateMock,
  setWriterStatus: statusMock,
  deleteWriter: deleteMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import {
  createWriterAction,
  deleteWriterAction,
  renameWriterAction,
  setWriterStatusAction,
} from "./actions";

const IDLE = { status: "idle" as const };
const INDUSTRY = "11111111-1111-1111-1111-111111111111";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  for (const m of [createMock, updateMock, statusMock, deleteMock]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
  createMock.mockResolvedValue(INDUSTRY);
  revalidateMock.mockReset();
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("createWriterAction", () => {
  it("adds a writer and revalidates the screen", async () => {
    const result = await createWriterAction(IDLE, form({ name: "  SaaS  " }));

    // Trimmed before the seam: " SaaS " and "SaaS" are the same writer, and the
    // unique index is case-insensitive, so leading space is a typo not a name.
    expect(createMock).toHaveBeenCalledWith("SaaS");
    expect(result).toEqual({ status: "saved", message: "SaaS added." });
    expect(revalidateMock).toHaveBeenCalledWith(paths.settings.writers);
  });

  it("rejects an empty name with zod, before the seam", async () => {
    const result = await createWriterAction(IDLE, form({ name: "   " }));

    expect(result).toEqual({ status: "error", message: "Name is required." });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("⚠️ guards BEFORE validating or writing", async () => {
    // ⚠️ THE ORDER IS THE ASSERTION. Every RPC re-checks `is_admin()` in SQL, so
    // a denied caller is refused either way — but an action that validated first
    // would report "Name is required." to someone who should have been redirected,
    // telling them the shape of a form they may not use.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(createWriterAction(IDLE, form({ name: "" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("⚠️ lets the redirect THROUGH rather than catching it", async () => {
    // ⚠️ THE DEFECT THIS REPO HAS ALREADY HAD ONCE. Next's `redirect()` denies by
    // THROWING; a `try/catch` around `requireAdmin()` swallows it and the guard
    // silently stops guarding — the denied user sees a form whose submit button
    // reports "NEXT_REDIRECT" instead of being sent away.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(createWriterAction(IDLE, form({ name: "SaaS" }))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("surfaces the database's message verbatim", async () => {
    createMock.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "writers_name_ci"'),
    );

    const result = await createWriterAction(IDLE, form({ name: "saas" }));

    expect(result).toMatchObject({ status: "error" });
    expect((result as { message: string }).message).toMatch(/writers_name_ci/);
  });
});

describe("renameWriterAction", () => {
  it("renames through update_writer", async () => {
    const result = await renameWriterAction(IDLE, form({ id: INDUSTRY, name: "Software" }));

    expect(updateMock).toHaveBeenCalledWith(INDUSTRY, "Software");
    expect(result).toMatchObject({ status: "saved" });
  });

  it("rejects a non-uuid id before the seam", async () => {
    const result = await renameWriterAction(IDLE, form({ id: "nope", name: "Software" }));

    expect(result).toMatchObject({ status: "error" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty new name", async () => {
    const result = await renameWriterAction(IDLE, form({ id: INDUSTRY, name: " " }));

    expect(result).toEqual({ status: "error", message: "Name is required." });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("setWriterStatusAction — the reversible path", () => {
  it("archives, and says so in words that promise a way back", async () => {
    const result = await setWriterStatusAction(IDLE, form({ id: INDUSTRY, status: "archived" }));

    expect(statusMock).toHaveBeenCalledWith(INDUSTRY, "archived");
    expect(result).toMatchObject({ status: "saved" });
    expect((result as { message: string }).message).toMatch(/restore/i);
  });

  it("restores", async () => {
    const result = await setWriterStatusAction(IDLE, form({ id: INDUSTRY, status: "active" }));

    expect(statusMock).toHaveBeenCalledWith(INDUSTRY, "active");
    expect(result).toMatchObject({ status: "saved" });
  });

  it("rejects a status the CHECK constraint would not accept", async () => {
    // The database raises 22023 for an unknown status; zod refuses it a round-trip
    // earlier. Both exist on purpose — this one is not a substitute for that one.
    const result = await setWriterStatusAction(IDLE, form({ id: INDUSTRY, status: "deleted" }));

    expect(result).toMatchObject({ status: "error" });
    expect(statusMock).not.toHaveBeenCalled();
  });
});

describe("deleteWriterAction — and the refusal it must not soften", () => {
  it("deletes an unused writer", async () => {
    const result = await deleteWriterAction(IDLE, form({ id: INDUSTRY }));

    expect(deleteMock).toHaveBeenCalledWith(INDUSTRY);
    expect(result).toMatchObject({ status: "saved" });
  });

  it("⚠️ passes the refusal through WITH ITS COUNT, unrewritten", async () => {
    // ⚠️ THE MESSAGE IS PART OF THE CONTRACT — the same rule `setStaffRole` keeps.
    // `delete_writer` counts the Clients recorded in the writer and names the
    // number; replacing that with "Cannot delete this writer" would leave an
    // admin with no idea whether the obstacle is three clients or thirty, and no
    // idea what to do next.
    const refusal = "cannot delete: 3 client(s) are still recorded against this writer";
    deleteMock.mockRejectedValueOnce(new Error(refusal));

    const result = await deleteWriterAction(IDLE, form({ id: INDUSTRY }));

    expect(result).toEqual({ status: "error", message: refusal });
    // Asserted on the NUMBER, not on "an error happened" — a generic message
    // would pass the looser check while destroying the useful half.
    expect((result as { message: string }).message).toMatch(/\b3\b/);
  });

  it("⚠️ re-implements NO part of the delete rule", async () => {
    // The action never counts clients itself and never decides in advance that a
    // delete will fail. A second copy of that rule, computed from an already-stale
    // read, would start refusing deletes the database would have allowed — or
    // offering ones it refuses.
    await deleteWriterAction(IDLE, form({ id: INDUSTRY }));

    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("guards before deleting", async () => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(deleteWriterAction(IDLE, form({ id: INDUSTRY }))).rejects.toThrow("NEXT_REDIRECT");
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
