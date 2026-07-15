import { redirect } from "next/navigation";

import { authDisabled } from "@/config";
import { getSession } from "@/lib/auth/session";
import { hasRole, roleFromUser, type Role } from "@/lib/authz";
import { paths } from "@/paths";

/** The current user's role (server-side). */
export async function getRole(): Promise<Role> {
  return roleFromUser(await getSession());
}

/**
 * Redirects to sign-in if unauthenticated, or to the dashboard if the user
 * lacks one of `allowed`. Use at the top of a protected Server Component.
 */
export async function requireRole(...allowed: Role[]): Promise<void> {
  if (authDisabled) return; // dev-only bypass when Supabase is unconfigured
  const user = await getSession();
  if (!user) redirect(paths.auth.signIn);
  if (!hasRole(user, ...allowed)) redirect(paths.dashboard.overview);
}
