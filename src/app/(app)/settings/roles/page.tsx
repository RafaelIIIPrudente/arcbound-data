import type { Metadata } from "next";

import { StaffRolesTable } from "@/components/dashboard/settings/staff-roles-table";
import { requireAdmin } from "@/lib/auth/roles";
import { listStaff } from "@/services/staff";

export const metadata: Metadata = { title: "Staff roles" };

/**
 * The Staff Roles admin screen (ADR 0013).
 *
 * ⚠️ ITS OWN ROUTE RATHER THAN A TAB ON `/settings`, AND THE GUARD IS WHY. This
 * page calls `requireAdmin()`; folding it into the profile page would force that
 * guard onto `/settings` too, locking every analyst out of their own profile and
 * password form in order to hide one panel from them.
 *
 * ⚠️ THE GUARD RUNS BEFORE THE READ. `list_staff` is the only way to enumerate
 * ArcBase staff accounts — a capability that did not exist before this slice — so
 * a denied caller must not cause it to run on their behalf.
 */
export default async function StaffRolesPage() {
  await requireAdmin();
  const staff = await listStaff();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff roles</h1>
        <p className="text-sm text-muted-foreground">
          Admins manage Clients and Report Links. Data Analysts upload data and read everything. An
          account with no assigned role is a Data Analyst.
        </p>
      </div>
      <StaffRolesTable staff={staff} />
    </div>
  );
}
