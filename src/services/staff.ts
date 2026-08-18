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
  /**
   * Whether this account has been invited but has not yet accepted
   * (`auth.users.email_confirmed_at is null`).
   *
   * ⚠️ A THIRD STATE, NOT A SHADE OF THE OTHER TWO. An invited row appears in the
   * roster immediately, so without this an admin cannot tell "invitation sent,
   * waiting on them" from "set up and working" (ADR 0014).
   */
  pending: boolean;
}

interface StaffRow {
  user_id: string;
  email: string;
  role: string;
  assigned: boolean;
  pending: boolean;
}

/**
 * The outcome of an invitation.
 *
 * ⚠️ `invited_without_role` IS NEITHER SUCCESS NOR FAILURE, AND MUST NOT BE
 * FLATTENED INTO EITHER. The invitation has been sent and the account exists — it
 * cannot be un-sent — but the role row failed, so the person will join as a Data
 * Analyst. Calling it success hides a privilege that was not granted; calling it
 * failure invites a retry against an email that now already exists.
 */
export type InviteStaffResult =
  { status: "invited" } | { status: "invited_without_role"; message: string };

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
    pending: row.pending,
  }));
}

/** One staff account, as any authenticated staff member may see it. */
export interface StaffDirectoryEntry {
  userId: string;
  email: string;
}

/**
 * Every staff account, as `user_id` and `email` — and NOTHING ELSE.
 *
 * ⚠️ THIS IS NOT `listStaff()` WITH FEWER FIELDS, IT IS A DIFFERENT RPC WITH A
 * DIFFERENT AUDIENCE. `list_staff` is admin-only and carries role, `assigned`
 * and `pending`; `list_staff_directory` is granted to every authenticated staff
 * member and returns two columns, so a Data Analyst can read
 * "Writer: ada@arcbound.com" instead of a raw uuid. That follows ADR 0013's own
 * principle — a privilege tier removes the ability to CHANGE things, never the
 * ability to SEE them — rather than widening the admin roster's reach. If this
 * function ever grows a role or an invite state, that boundary is gone.
 *
 * ⚠️ THROWS ON FAILURE, and `clients.ts` deliberately does NOT let that reach
 * `getClient` — see the block above `staffEmailsById` there, which explains why
 * a throw from this read would silently disable the upload name-match gate. A
 * caller that wants to tell a broken directory from an empty one (S3's writer
 * picker) gets that distinction here.
 */
export async function listStaffDirectory(): Promise<StaffDirectoryEntry[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("list_staff_directory");
  if (error) throw new Error(`Failed to list the staff directory: ${error.message}`);

  const rows = (data ?? []) as { user_id: string; email: string }[];
  // Two fields, named explicitly. A column added to the RPC later cannot reach a
  // screen through this mapping without someone editing this line.
  return rows.map((row) => ({ userId: row.user_id, email: row.email }));
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

/**
 * supabase-js collapses every non-2xx from an Edge Function into the same generic
 * message and puts the real response on `error.context`. This digs the function's
 * own `{ error }` back out, so a 403, a rejected email and a misconfigured function
 * do not all read identically to the admin who triggered them.
 */
async function edgeErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const context = error.context as { json?: () => Promise<unknown> } | undefined;
  if (typeof context?.json !== "function") return error.message;
  try {
    const body = (await context.json()) as { error?: unknown };
    return typeof body?.error === "string" && body.error ? body.error : error.message;
  } catch {
    // No JSON body (a network-level failure). The wrapper message is all there is.
    return error.message;
  }
}

/**
 * Invite a new staff member by email and assign their Staff Role.
 *
 * ⚠️ THIS IS THE ONLY CALLER OF THE `invite-staff` EDGE FUNCTION, AND THE REASON
 * IT IS AN EDGE FUNCTION AT ALL. Inviting is a GoTrue admin operation requiring the
 * service-role key — a key that bypasses RLS on every table, including Outreach
 * PII (ADR 0012). It is kept out of this repo, out of the Next runtime and out of
 * Vercel entirely, living only in the function's injected environment (ADR 0014).
 *
 * `functions.invoke` attaches the CALLER's session JWT automatically; the function
 * authorises from that, never from the service-role key.
 */
export async function inviteStaff(email: string, role: StaffRole): Promise<InviteStaffResult> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.functions.invoke("invite-staff", {
    body: { email, role },
  });

  if (error) throw new Error(await edgeErrorMessage(error));

  const result = data as { status?: unknown; message?: unknown } | null;

  if (result?.status === "invited") return { status: "invited" };
  if (result?.status === "invited_without_role") {
    return {
      status: "invited_without_role",
      message:
        typeof result.message === "string" && result.message
          ? result.message
          : "The invitation was sent, but their role could not be saved. They will join as a Data Analyst.",
    };
  }

  // ⚠️ FAIL CLOSED ON A SHAPE WE DO NOT RECOGNISE. Returning "invited" for an
  // unknown response would report a success nobody verified.
  throw new Error("The invite service returned an unexpected response.");
}
