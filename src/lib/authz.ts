import type { User } from "@supabase/supabase-js";

// Authorization primitives. This module is pure and edge-safe (imported by
// middleware). Server-only helpers that redirect live in `authz.server.ts`.
// A user's role is read from their Supabase `app_metadata.role`. Set it with
// the service-role key or a SQL trigger; never trust client-supplied metadata.

export const ROLES = ["superadmin", "admin", "manager", "member"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "member";

type UserLike = Pick<User, "app_metadata"> | null | undefined;

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** The app-assigned role for a Supabase user, defaulting to `member`. */
export function roleFromUser(user: UserLike): Role {
  const raw = user?.app_metadata?.role;
  return isRole(raw) ? raw : DEFAULT_ROLE;
}

/** True when the user's role is one of `allowed`. */
export function hasRole(user: UserLike, ...allowed: Role[]): boolean {
  return allowed.includes(roleFromUser(user));
}
