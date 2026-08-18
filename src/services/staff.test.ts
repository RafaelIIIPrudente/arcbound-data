import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the RPC seam is mocked. Nothing hits Postgres — see the note in
// supabase/staff-roles-admin.test.ts about what is and is not proven by tests.
const { rpcMock, invokeMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), invokeMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: rpcMock, functions: { invoke: invokeMock } }),
}));

import { inviteStaff, listStaff, setStaffRole } from "./staff";

const ADMIN_ROW = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "admin@arcbound.com",
  role: "admin",
  assigned: true,
  pending: false,
};
const UNASSIGNED_ROW = {
  user_id: "22222222-2222-2222-2222-222222222222",
  email: "newhire@arcbound.com",
  role: "analyst",
  assigned: false,
  pending: true,
};

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
});

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
        pending: false,
      },
      {
        userId: UNASSIGNED_ROW.user_id,
        email: "newhire@arcbound.com",
        role: "analyst",
        assigned: false,
        // ⚠️ INVITED BUT NOT YET ACCEPTED — a third fact, distinct from both
        // "assigned admin" and "defaulted analyst". It must survive the mapping
        // or an invited person is indistinguishable from an established one.
        pending: true,
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

describe("inviteStaff", () => {
  it("invokes the edge function with the email and role", async () => {
    invokeMock.mockResolvedValueOnce({ data: { status: "invited" }, error: null });

    const result = await inviteStaff("newhire@arcbound.com", "analyst");

    expect(invokeMock).toHaveBeenCalledWith("invite-staff", {
      body: { email: "newhire@arcbound.com", role: "analyst" },
    });
    expect(result).toEqual({ status: "invited" });
  });

  it("⚠️ reports a sent invitation with an unsaved role as its OWN outcome", async () => {
    // ⚠️ NOT SUCCESS, NOT FAILURE — AND THE DISTINCTION IS NOT COSMETIC.
    //
    // The invitation cannot be un-sent: the account exists. Only the role row
    // failed, so the person will join as a Data Analyst (ADR 0013's default).
    // Reporting success would leave an admin believing they had created an admin.
    // Reporting failure would imply nothing happened, and they would invite again
    // — against an email that now already exists.
    invokeMock.mockResolvedValueOnce({
      data: {
        status: "invited_without_role",
        message: "Invitation sent, but their role could not be saved.",
      },
      error: null,
    });

    const result = await inviteStaff("newhire@arcbound.com", "admin");

    expect(result).toEqual({
      status: "invited_without_role",
      message: "Invitation sent, but their role could not be saved.",
    });
  });

  it("⚠️ surfaces the edge function's own error text, not the generic wrapper", async () => {
    // ⚠️ supabase-js collapses EVERY non-2xx into "Edge Function returned a
    // non-2xx status code" and hides the real body on `error.context`. Passing
    // that through would tell an admin nothing — a 403, a bad email and a
    // misconfigured function would all read identically. The real message is read
    // out of the response.
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "admin role required" }) },
      },
    });

    await expect(inviteStaff("someone@arcbound.com", "admin")).rejects.toThrow(
      /admin role required/,
    );
  });

  it("falls back to the wrapper message when the body cannot be read", async () => {
    // A network-level failure has no JSON body at all; it must still throw
    // something, not crash trying to parse nothing.
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Failed to send a request to the Edge Function" },
    });

    await expect(inviteStaff("someone@arcbound.com", "admin")).rejects.toThrow(
      /Failed to send a request/,
    );
  });

  it("treats an unrecognised response shape as a failure, never as success", async () => {
    // Fail closed on the unknown: silently returning "invited" for a response we
    // do not understand would report a success nobody verified.
    invokeMock.mockResolvedValueOnce({ data: { unexpected: true }, error: null });

    await expect(inviteStaff("someone@arcbound.com", "admin")).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ FOUR TESTS FOR `listStaffDirectory` WERE DELETED HERE (D15), AND THE
// CONSTRUCT IS THE DELETION OF THE FUNCTION ITSELF.
//
//   • "maps user_id/email, and calls the DIRECTORY rpc — never list_staff"
//   • "carries NO role, assigned or pending — even if the RPC grew them"
//   • "returns an empty directory when the RPC yields no rows"
//   • "THROWS when the directory read fails"
//
// `listStaffDirectory` and `StaffDirectoryEntry` no longer exist in `./staff`,
// so importing them is a compile error — the deleted tests cannot be
// reintroduced without reintroducing the function. It had exactly one caller,
// `clients.ts`, resolving a `writer_id` that pointed at `auth.users`; a writer
// is now a row in `public.writers` read through the client select's own embed,
// so there is nobody left to ask.
//
// ⚠️ WHAT THEY GUARDED IS NOT LOST. Their real subject was the boundary between
// `list_staff` (admin-only: role, `assigned`, `pending`) and the two-column
// directory granted to every analyst. That boundary is now simply the absence of
// the second RPC — `list_staff` is the only staff read left, and the tests above
// still pin that it is admin-gated. The SQL function is dropped separately and
// later; see supabase/drop-staff-directory.sql.
// ─────────────────────────────────────────────────────────────────────────────
