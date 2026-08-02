import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authDisabled } from "@/config";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/paths";

/**
 * The privilege tier attached to an Arcbound staff account (ADR 0013).
 *
 * A Staff Role is NOT a tenant — ADR 0007 stands and all staff still share one
 * dataset. This is a privilege tier, not a data partition.
 */
export type StaffRole = "admin" | "analyst";

/**
 * The current user's Staff Role; `null` when there is no authenticated user.
 *
 * Reads `public.staff_roles` directly rather than through the `src/services/*`
 * seam, mirroring `getSession()` — auth/identity is the established exception to
 * the seam rule, and a role read that had to go through a service would invert
 * the dependency (services are the thing S2 will guard).
 *
 * ⚠️ EVERY UNKNOWN RESOLVES TO `analyst`, NEVER TO `admin`.
 *
 * A dropped connection, a missing row, a revoked grant, a value the CHECK
 * constraint should have made impossible — all of them mean "we do not know",
 * and not knowing must cost privilege rather than grant it. This function also
 * never throws: a layout calls it, so a throw would blank the entire shell
 * instead of degrading one affordance.
 *
 * ⚠️ THE SCOPE OF THE MEMO IS THE SECURITY PROPERTY, NOT AN OPTIMISATION.
 *
 * React's `cache()` is REQUEST-scoped: the memo lives for one server render and
 * is discarded with it, so one visitor's role can never be handed to another. It
 * takes no arguments, so a request has exactly one entry.
 *
 * This must NOT be swapped for `unstable_cache`, `revalidate`, or any store that
 * persists BETWEEN requests. Those are keyed by input, and since this function
 * has no inputs, every visitor would share one entry — the first admin to load a
 * page would hand admin to everyone after them. That is privilege escalation,
 * not a stale-cache annoyance. A source guard in roles.test.ts asserts the
 * substitution has not been made, because nothing else would catch it: both
 * versions behave identically within a single request.
 */
export const getRole = cache(async (): Promise<StaffRole | null> => {
  // FIRST, and deliberately before the session read. In auth-disabled dev there
  // is no Supabase project to ask, so `getSession()` returns null and every
  // later branch would answer "no user". Safe because `authDisabled` is false in
  // every production build by construction (see config.ts).
  if (authDisabled) return "admin";

  // Outside the try on purpose: `getSession()` is total — it catches its own
  // failures and returns null — so there is nothing here to degrade. `null` here
  // means "nobody is signed in", which is distinct from "we could not read the
  // role", and collapsing the two would lose that.
  const user = await getSession();
  if (!user) return null;

  try {
    // `createClient` is inside the try so a throw from IT degrades too, rather
    // than escaping past the guard below.
    const supabase = createClient(cookies());
    const { data, error } = await supabase
      .from("staff_roles")
      // Own-row RLS means this can only ever return the caller's own row; the
      // `eq` is what makes that explicit rather than incidental.
      .select("role")
      .eq("user_id", user.id)
      // NOT `.single()`: no row is the DEFAULT state (an unassigned account),
      // and `.single()` would turn that ordinary case into an error.
      .maybeSingle();

    if (error) {
      console.warn(`Failed to read staff role: ${error.message}`);
      return "analyst";
    }

    // Anything that is not exactly 'admin' — including a value the CHECK
    // constraint should have made unreachable — is not admin. A column read is
    // not a type guarantee.
    const row = data as { role?: string } | null;
    return row?.role === "admin" ? "admin" : "analyst";
  } catch (err) {
    console.warn(`Failed to read staff role: ${err instanceof Error ? err.message : String(err)}`);
    return "analyst";
  }
});

/** True only for an authenticated admin. `null` (no user) is never admin. */
export function isAdmin(role: StaffRole | null): boolean {
  return role === "admin";
}

/**
 * Redirects to `paths.home` unless the caller is an admin.
 *
 * ⚠️ DELIBERATELY UNCALLED IN THIS SLICE — S2 wires it into the guarded routes
 * and actions. It is built and tested here so S2 turns the boundary on against a
 * primitive that is already proven, rather than one written under the pressure of
 * making a screen work.
 *
 * Redirects rather than throwing so a denied staff member lands somewhere they
 * can use, instead of on an error boundary. `redirect()` never returns.
 */
export async function requireAdmin(): Promise<void> {
  if (!isAdmin(await getRole())) redirect(paths.home);
}
