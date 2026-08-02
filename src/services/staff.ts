import { cookies } from "next/headers";

import type { StaffRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────────────────────
// Staff Roles seam (real). The service face of public.list_staff() and
// public.set_staff_role() (see supabase/staff-roles-admin.sql).
//
// Both are SECURITY DEFINER RPCs and both are admin-gated INSIDE the database:
// `auth.users` is not readable by `authenticated`, `public.staff_roles` is
// own-row-readable only, and it carries no write policies at all. ArcBase holds
// no service-role key, so these functions are the only path (ADR 0013).
//
// ⚠️ THIS MODULE KNOWS NOTHING ABOUT THE LAST-ADMIN RULE, AND MUST NOT LEARN.
// `set_staff_role` refuses any change leaving zero admins. That invariant lives
// in exactly one place — the function body — and everything above simply reports
// what it said. A second copy here (or in the UI) would drift from the first, and
// the copy users see would drift into a lie before anyone noticed.
// ─────────────────────────────────────────────────────────────────────────────

/** One staff account and the Staff Role it effectively holds. */
export interface StaffMember {
  userId: string;
  email: string;
  role: StaffRole;
  /**
   * Whether a `staff_roles` row EXISTS for this account.
   *
   * ⚠️ `false` DOES NOT MEAN "not an analyst" — it means nobody has assigned a
   * role, so `analyst` is a DEFAULT arrived at by least privilege rather than a
   * decision on record. The two behave identically and are different facts; the
   * screen shows them differently, so this must not be dropped in the mapping.
   */
  assigned: boolean;
}

interface StaffRow {
  user_id: string;
  email: string;
  role: string;
  assigned: boolean;
}

/**
 * Every ArcBase staff account with its effective Staff Role. Admin-only —
 * `list_staff` raises `42501` for anyone else.
 *
 * ⚠️ THROWS ON FAILURE RATHER THAN RETURNING AN EMPTY ROSTER. On this screen an
 * empty list reads as "there are no staff accounts", which is a claim a reader
 * has no way to distinguish from a broken read. Failing loudly is the only honest
 * option here (contrast `getReportLink`, where null genuinely means "no link").
 */
export async function listStaff(): Promise<StaffMember[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("list_staff");
  if (error) throw new Error(`Failed to list staff: ${error.message}`);

  const rows = (data ?? []) as StaffRow[];
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    // The database already applied the default; anything not 'admin' is analyst.
    role: row.role === "admin" ? "admin" : "analyst",
    assigned: row.assigned,
  }));
}

/**
 * Assign a Staff Role. Admin-only, and refused if it would leave zero admins.
 *
 * ⚠️ THE ERROR MESSAGE IS PART OF THE CONTRACT. `set_staff_role` writes its
 * refusals in human words ("at least one admin must remain"), because the app
 * deliberately does not predict them — the server's own text is the entire
 * explanation the user gets. Do not replace it with a generic message.
 */
export async function setStaffRole(userId: string, role: StaffRole): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("set_staff_role", { p_user_id: userId, p_role: role });
  if (error) throw new Error(error.message);
}
