"use client";

import { useActionState } from "react";

import {
  inviteStaffAction,
  setStaffRoleAction,
  type InviteStaffState,
  type SetStaffRoleState,
} from "@/app/(app)/settings/roles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StaffMember } from "@/services/staff";

// ─────────────────────────────────────────────────────────────────────────────
// The Staff Roles roster (ADR 0013). Admin-only — the page calls `requireAdmin()`
// before this ever renders.
//
// ⚠️ THIS COMPONENT DOES NOT KNOW THE LAST-ADMIN RULE, AND MUST NEVER LEARN IT.
//
// `set_staff_role` refuses any change that would leave zero admins. It would be
// easy to also grey out the demote option for the only admin "to be helpful" —
// and that would be a second copy of the rule, computed from a list that is
// already stale (another admin may have been added in another tab a second ago).
// Two copies drift, and the copy users see drifts first, silently, into telling
// someone they cannot do something they can. So: every tier is always offered,
// every row always submits, and the server's refusal is rendered where it lands.
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: SetStaffRoleState = { status: "idle" };

const ROLE_LABEL: Record<StaffMember["role"], string> = {
  admin: "Admin",
  analyst: "Data Analyst",
};

interface RowViewProps {
  member: StaffMember;
  state: SetStaffRoleState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

/** Pure(ish) render of one roster row — testable without firing a server action. */
export function StaffRoleRowView({ member, state, formAction, pending }: RowViewProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm">{member.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {ROLE_LABEL[member.role]}
          {/* ⚠️ ABSENCE IS A DISTINCT FACT. No `staff_roles` row means the tier
              was never decided — it is least privilege filling the gap. Saying so
              is the difference between "we chose this" and "nobody has looked". */}
          {member.assigned ? null : (
            <span className="ml-1.5 text-muted-foreground/80">· default — no role assigned</span>
          )}
          {/* ⚠️ AND SO IS "HAS NOT ACCEPTED YET". The account exists from the
              moment the invitation is sent, so without this an invited person is
              indistinguishable from an established one (ADR 0014). */}
          {member.pending ? (
            <span className="ml-1.5 text-primary">· invitation pending</span>
          ) : null}
        </p>

        {state.status === "error" ? (
          <p role="alert" className="mt-1.5 text-xs text-destructive">
            {state.message}
          </p>
        ) : null}
        {state.status === "saved" ? (
          <p role="status" className="mt-1.5 text-xs text-muted-foreground">
            Saved.
          </p>
        ) : null}
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="user_id" value={member.userId} />
        <label className="sr-only" htmlFor={`role-${member.userId}`}>
          Staff role for {member.email}
        </label>
        <select
          id={`role-${member.userId}`}
          name="role"
          defaultValue={member.role}
          className="h-9 rounded-md border bg-transparent px-2.5 text-sm"
        >
          <option value="admin">Admin</option>
          <option value="analyst">Data Analyst</option>
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}

/** One row, wired to its own action state so rows fail independently. */
function StaffRoleRow({ member }: { member: StaffMember }) {
  const [state, formAction, pending] = useActionState(setStaffRoleAction, IDLE);
  return (
    <StaffRoleRowView member={member} state={state} formAction={formAction} pending={pending} />
  );
}

const INVITE_IDLE: InviteStaffState = { status: "idle" };

interface InviteViewProps {
  state: InviteStaffState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

/**
 * Invite a new staff member (ADR 0014).
 *
 * ⚠️ THREE OUTCOMES, THREE TREATMENTS — AND THE MIDDLE ONE IS THE POINT.
 * `invited_without_role` means the email went out and the account exists, but the
 * role did not save, so they will join as a Data Analyst. Showing that in the same
 * "success" styling as a clean invite would tell an admin they had created an admin
 * when they had not. It is an alert, not a confirmation.
 */
export function InviteStaffFormView({ state, formAction, pending }: InviteViewProps) {
  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Invite a staff member
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="invite-email" className="sr-only">
            Email address
          </label>
          <Input
            id="invite-email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="off"
            placeholder="name@arcbound.com"
          />
        </div>

        <div>
          <label htmlFor="invite-role" className="sr-only">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            // ⚠️ LEAST PRIVILEGE AT THE POINT OF CREATION. Submitting without
            // thinking creates an analyst, never an admin.
            defaultValue="analyst"
            className="h-9 rounded-md border bg-transparent px-2.5 text-sm"
          >
            <option value="analyst">Data Analyst</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        They receive an email from Supabase and set their own password. They appear below as pending
        until they accept.
      </p>

      {state.status === "invited" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {state.message}
        </p>
      ) : null}
      {state.status === "invited_without_role" || state.status === "error" ? (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** The invite form, wired to its action state. */
function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaffAction, INVITE_IDLE);
  return <InviteStaffFormView state={state} formAction={formAction} pending={pending} />;
}

/** The whole roster. */
export function StaffRolesTable({ staff }: { staff: StaffMember[] }) {
  return (
    <div className="space-y-4">
      <InviteStaffForm />

      {staff.length === 0 ? (
        // Only reachable if the roster genuinely came back empty — `listStaff`
        // throws on a failed read rather than degrading to `[]`, so this cannot be
        // a disguised error.
        <p className="text-sm text-muted-foreground">No staff accounts found.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          {staff.map((member) => (
            <StaffRoleRow key={member.userId} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
