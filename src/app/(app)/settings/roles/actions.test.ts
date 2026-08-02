import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the seam, next/cache and the role guard are mocked.
const { setRoleMock, revalidateMock, requireAdminMock } = vi.hoisted(() => ({
  setRoleMock: vi.fn(),
  revalidateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));
vi.mock("@/services/staff", () => ({ setStaffRole: setRoleMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import { setStaffRoleAction } from "./actions";

const IDLE = { status: "idle" as const };
const USER = "11111111-1111-1111-1111-111111111111";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  setRoleMock.mockReset();
  setRoleMock.mockResolvedValue(undefined);
  revalidateMock.mockReset();
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("setStaffRoleAction — as an admin", () => {
  it("assigns the role and revalidates the roster", async () => {
    const state = await setStaffRoleAction(IDLE, form({ user_id: USER, role: "admin" }));

    expect(setRoleMock).toHaveBeenCalledWith(USER, "admin");
    expect(revalidateMock).toHaveBeenCalledWith(paths.settings.roles);
    expect(state.status).toBe("saved");
  });

  it("rejects an unknown role without touching the seam", async () => {
    const state = await setStaffRoleAction(IDLE, form({ user_id: USER, role: "superadmin" }));

    expect(state.status).toBe("error");
    expect(setRoleMock).not.toHaveBeenCalled();
  });
});

describe("setStaffRoleAction RENDERS the database's refusal", () => {
  it("⚠️ returns the server's own words, and does not revalidate", async () => {
    // ⚠️ THE WHOLE DESIGN IN ONE TEST.
    //
    // The last-admin invariant lives ONLY in `set_staff_role`. The app never
    // predicts it — no pre-disabled control, no client-side count — so the only
    // way a user learns why a change was refused is that this action carries the
    // database's message back verbatim. Swapping it for a generic "Something
    // went wrong" would make the invariant indistinguishable from a bug.
    setRoleMock.mockRejectedValueOnce(new Error("at least one admin must remain"));

    const state = await setStaffRoleAction(IDLE, form({ user_id: USER, role: "analyst" }));

    expect(state).toEqual({ status: "error", message: "at least one admin must remain" });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("returns an error state rather than throwing, so the message can be shown", async () => {
    // A throw here would hit the error boundary and blank the screen — the user
    // would never read the refusal.
    setRoleMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      setStaffRoleAction(IDLE, form({ user_id: USER, role: "analyst" })),
    ).resolves.toMatchObject({ status: "error" });
  });
});

describe("setStaffRoleAction refuses a non-admin (ADR 0013)", () => {
  it("never reaches the seam", async () => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(setStaffRoleAction(IDLE, form({ user_id: USER, role: "admin" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(setRoleMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("⚠️ lets the redirect ESCAPE rather than catching it into an error state", async () => {
    // ⚠️ `requireAdmin()` MUST SIT OUTSIDE THE try. This action catches failures
    // on purpose — that is how the database's refusal gets rendered — so a guard
    // placed inside the try would be caught too, and the denial would surface as
    // a message reading "NEXT_REDIRECT" instead of actually redirecting.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    const outcome = await setStaffRoleAction(IDLE, form({ user_id: USER, role: "admin" })).then(
      (state) => ({ kind: "returned" as const, state }),
      () => ({ kind: "threw" as const }),
    );

    expect(outcome.kind).toBe("threw");
  });

  it("refuses BEFORE validating, so a non-admin learns nothing from the form", async () => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(
      setStaffRoleAction(IDLE, form({ user_id: "not-a-uuid", role: "nonsense" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
