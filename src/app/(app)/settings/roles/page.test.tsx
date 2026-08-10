import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminMock, listStaffMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  listStaffMock: vi.fn(),
}));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/services/staff", () => ({ listStaff: listStaffMock }));

import StaffRolesPage from "./page";

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

const ROSTER = [
  {
    userId: "11111111-1111-1111-1111-111111111111",
    email: "admin@arcbound.com",
    role: "admin" as const,
    assigned: true,
  },
  {
    userId: "33333333-3333-3333-3333-333333333333",
    email: "newhire@arcbound.com",
    role: "analyst" as const,
    assigned: false,
  },
];

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
  listStaffMock.mockReset();
  listStaffMock.mockResolvedValue(ROSTER);
});

describe("the Staff Roles page", () => {
  it("renders the whole roster for an admin", async () => {
    render(await StaffRolesPage());

    expect(screen.getByText("admin@arcbound.com")).toBeInTheDocument();
    expect(screen.getByText("newhire@arcbound.com")).toBeInTheDocument();
  });

  it("⚠️ refuses an analyst BEFORE reading the roster", async () => {
    // ⚠️ THE ORDER IS THE ASSERTION, NOT JUST THE REDIRECT.
    //
    // `list_staff` is the only way to enumerate ArcBase staff accounts — a read
    // surface that did not exist before this slice. If the page fetched first and
    // guarded second, a denied analyst would still have caused the roster to be
    // read on their behalf. Guarding first means the query never runs.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(StaffRolesPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(listStaffMock).not.toHaveBeenCalled();
  });
});
