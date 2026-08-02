"use client";

import { useActionState } from "react";

import { setStaffRoleAction, type SetStaffRoleState } from "@/app/(app)/settings/roles/actions";
import { Button } from "@/components/ui/button";
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

/** The whole roster. */
export function StaffRolesTable({ staff }: { staff: StaffMember[] }) {
  if (staff.length === 0) {
    // Only reachable if the roster genuinely came back empty — `listStaff`
    // throws on a failed read rather than degrading to `[]`, so this cannot be
    // a disguised error.
    return <p className="text-sm text-muted-foreground">No staff accounts found.</p>;
  }

  return (
    <div className="rounded-lg border bg-card">
      {staff.map((member) => (
        <StaffRoleRow key={member.userId} member={member} />
      ))}
    </div>
  );
}
