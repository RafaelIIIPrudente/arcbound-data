import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StaffMember } from "@/services/staff";

import { StaffRoleRowView } from "./staff-roles-table";

const ADMIN: StaffMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "admin@arcbound.com",
  role: "admin",
  assigned: true,
};
const ASSIGNED_ANALYST: StaffMember = {
  userId: "22222222-2222-2222-2222-222222222222",
  email: "analyst@arcbound.com",
  role: "analyst",
  assigned: true,
};
const DEFAULTED_ANALYST: StaffMember = {
  userId: "33333333-3333-3333-3333-333333333333",
  email: "newhire@arcbound.com",
  role: "analyst",
  assigned: false,
};

const noop = () => {};
const baseProps = { state: { status: "idle" as const }, formAction: noop, pending: false };

describe("StaffRoleRowView", () => {
  it("shows the account and preselects its current tier", () => {
    render(<StaffRoleRowView member={ADMIN} {...baseProps} />);

    expect(screen.getByText("admin@arcbound.com")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /staff role/i })).toHaveValue("admin");
  });

  it("⚠️ distinguishes a DEFAULTED analyst from an ASSIGNED one", () => {
    // ⚠️ THE TWO ROWS BEHAVE IDENTICALLY AND ARE NOT THE SAME FACT.
    //
    // One person was given Data Analyst; the other has no `staff_roles` row at
    // all and is defaulted into it by least privilege. On a screen whose entire
    // job is showing who holds what, collapsing them would hide the accounts most
    // likely to need attention — the ones nobody has decided about yet. Asserting
    // BOTH in one test is what makes a collapse fail.
    render(
      <div>
        <StaffRoleRowView member={ASSIGNED_ANALYST} {...baseProps} />
        <StaffRoleRowView member={DEFAULTED_ANALYST} {...baseProps} />
      </div>,
    );

    // Both read as Data Analyst…
    expect(screen.getAllByText(/data analyst/i).length).toBeGreaterThanOrEqual(2);
    // …but only the unassigned one says the tier was never actually assigned.
    expect(screen.getByText(/no role assigned/i)).toBeInTheDocument();
  });

  it("renders the server's refusal verbatim", () => {
    render(
      <StaffRoleRowView
        member={ADMIN}
        {...baseProps}
        state={{ status: "error", message: "at least one admin must remain" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("at least one admin must remain");
  });

  it("⚠️ never pre-disables the control to predict the last-admin rule", () => {
    // ⚠️ THE INVARIANT LIVES IN THE DATABASE, AND ONLY THERE.
    //
    // It is tempting to grey out the demote option for the only admin. That would
    // be a SECOND copy of the rule — one that cannot see the real table, goes
    // stale the moment another admin is added in a different tab, and drifts into
    // telling the user something untrue. This row therefore always offers every
    // tier and always submits; the refusal comes back from `set_staff_role` and
    // is rendered above.
    render(<StaffRoleRowView member={ADMIN} {...baseProps} />);

    const select = screen.getByRole("combobox", { name: /staff role/i });
    expect(select).toBeEnabled();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
    // The demote option is present and selectable, not hidden or disabled.
    expect(screen.getByRole("option", { name: /data analyst/i })).not.toBeDisabled();
  });

  it("disables Save only while a submission is in flight", () => {
    render(<StaffRoleRowView member={ADMIN} {...baseProps} pending />);

    expect(screen.getByRole("button", { name: /sav/i })).toBeDisabled();
  });

  it("confirms a successful assignment", () => {
    render(<StaffRoleRowView member={ADMIN} {...baseProps} state={{ status: "saved" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });
});
