import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the RPC seam is mocked. Nothing hits Postgres — see the note in
// supabase/staff-roles-admin.test.ts about what is and is not proven by tests.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc: rpcMock }) }));

import { listStaff, setStaffRole } from "./staff";

const ADMIN_ROW = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "admin@arcbound.com",
  role: "admin",
  assigned: true,
};
const UNASSIGNED_ROW = {
  user_id: "22222222-2222-2222-2222-222222222222",
  email: "newhire@arcbound.com",
  role: "analyst",
  assigned: false,
};

beforeEach(() => rpcMock.mockReset());

describe("listStaff", () => {
  it("maps the roster, preserving who was ASSIGNED and who merely defaulted", async () => {
    // ⚠️ THE `assigned` FLAG IS THE POINT OF THIS TEST.
    //
    // Both rows below render as "Data Analyst"-ish tiers and behave identically,
    // but they are not the same fact: one person was given the role, the other
    // has no staff_roles row at all and is defaulted into it by least privilege.
    // A screen whose whole job is showing who holds what must not collapse them,
    // so the flag has to survive the mapping.
    rpcMock.mockResolvedValueOnce({ data: [ADMIN_ROW, UNASSIGNED_ROW], error: null });

    const staff = await listStaff();

    expect(rpcMock).toHaveBeenCalledWith("list_staff");
    expect(staff).toEqual([
      {
        userId: ADMIN_ROW.user_id,
        email: "admin@arcbound.com",
        role: "admin",
        assigned: true,
      },
      {
        userId: UNASSIGNED_ROW.user_id,
        email: "newhire@arcbound.com",
        role: "analyst",
        assigned: false,
      },
    ]);
  });

  it("returns an empty roster when the RPC yields no rows", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await expect(listStaff()).resolves.toEqual([]);
  });

  it("throws rather than reporting an empty roster when the read fails", async () => {
    // ⚠️ NEVER DEGRADE THIS ONE TO `[]`. An empty list on this screen reads as
    // "there are no staff accounts", which is a lie a reader cannot detect. A
    // failed read must look like a failure.
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });

    await expect(listStaff()).rejects.toThrow(/permission denied/);
  });
});

describe("setStaffRole", () => {
  it("passes the user and role to the definer function", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await setStaffRole(ADMIN_ROW.user_id, "analyst");

    expect(rpcMock).toHaveBeenCalledWith("set_staff_role", {
      p_user_id: ADMIN_ROW.user_id,
      p_role: "analyst",
    });
  });

  it("⚠️ surfaces the database's refusal text verbatim", async () => {
    // The last-admin rule lives ONLY in set_staff_role. The app does not predict
    // it, so the server's own words are the only explanation the user will get —
    // replacing them with a generic "Something went wrong" would leave an admin
    // unable to tell a permission problem from the invariant doing its job.
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "at least one admin must remain" },
    });

    await expect(setStaffRole(ADMIN_ROW.user_id, "analyst")).rejects.toThrow(
      /at least one admin must remain/,
    );
  });
});
