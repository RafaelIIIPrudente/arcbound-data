import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StaffMember } from "@/services/staff";

import { InviteStaffFormView, StaffRoleRowView } from "./staff-roles-table";

const ADMIN: StaffMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "admin@arcbound.com",
  role: "admin",
  assigned: true,
  pending: false,
};
const ASSIGNED_ANALYST: StaffMember = {
  userId: "22222222-2222-2222-2222-222222222222",
  email: "analyst@arcbound.com",
  role: "analyst",
  assigned: true,
  pending: false,
};
const DEFAULTED_ANALYST: StaffMember = {
  userId: "33333333-3333-3333-3333-333333333333",
  email: "newhire@arcbound.com",
  role: "analyst",
  assigned: false,
  pending: false,
};
/** Invited moments ago; the account exists but nobody has accepted it yet. */
const INVITED: StaffMember = {
  userId: "44444444-4444-4444-4444-444444444444",
  email: "invited@arcbound.com",
  role: "analyst",
  assigned: true,
  pending: true,
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

describe("StaffRoleRowView — invited but not yet accepted", () => {
  it("⚠️ marks a pending invitation, and does NOT mark an accepted account", () => {
    // ⚠️ BOTH HALVES IN ONE TEST, for the same reason as the defaulted-analyst
    // case above. An invited row appears in the roster the instant the email is
    // sent, so a marker that never renders and a marker that always renders are
    // equally wrong and equally invisible when asserted separately.
    render(
      <div>
        <StaffRoleRowView member={INVITED} {...baseProps} />
        <StaffRoleRowView member={ASSIGNED_ANALYST} {...baseProps} />
      </div>,
    );

    expect(screen.getByText(/invitation pending/i)).toBeInTheDocument();
    expect(screen.getAllByText(/invitation pending/i)).toHaveLength(1);
  });

  it("still lets an admin set the role of someone who has not accepted", () => {
    // The role row is independent of acceptance — fixing a mis-set role should not
    // require waiting for the person to click their email.
    render(<StaffRoleRowView member={INVITED} {...baseProps} />);

    expect(screen.getByRole("combobox", { name: /staff role/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
});

describe("InviteStaffFormView", () => {
  const inviteProps = { state: { status: "idle" as const }, formAction: noop, pending: false };

  it("asks for an email and a role", () => {
    render(<InviteStaffFormView {...inviteProps} />);

    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /role/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeInTheDocument();
  });

  it("defaults the role to Data Analyst — the least privileged option", () => {
    // ⚠️ LEAST PRIVILEGE AT THE POINT OF CREATION. An admin who submits without
    // thinking should create an analyst, not an admin.
    render(<InviteStaffFormView {...inviteProps} />);

    expect(screen.getByRole("combobox", { name: /role/i })).toHaveValue("analyst");
  });

  it("confirms a sent invitation", () => {
    render(
      <InviteStaffFormView
        {...inviteProps}
        state={{ status: "invited", message: "Invitation sent to new@arcbound.com." }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Invitation sent to new@arcbound.com.");
  });

  it("⚠️ shows a PARTIAL success as a warning, never as a plain confirmation", () => {
    // ⚠️ THE OUTCOME THIS WHOLE FEATURE IS MOST LIKELY TO GET WRONG.
    //
    // The invitation went out and the account exists, but the role did not save,
    // so the person will join as a Data Analyst. Rendering this in the same
    // "success" treatment as a clean invite would tell an admin they had created
    // an admin when they had not — a privilege they would then assume was in
    // place. It gets `role="alert"`, not `role="status"`.
    render(
      <InviteStaffFormView
        {...inviteProps}
        state={{
          status: "invited_without_role",
          message: "Invitation sent, but their role could not be saved.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invitation sent, but their role could not be saved.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the invite service's error verbatim", () => {
    render(
      <InviteStaffFormView
        {...inviteProps}
        state={{ status: "error", message: "A user with this email already exists" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("A user with this email already exists");
  });

  it("disables submission only while in flight", () => {
    render(<InviteStaffFormView {...inviteProps} pending />);

    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});
