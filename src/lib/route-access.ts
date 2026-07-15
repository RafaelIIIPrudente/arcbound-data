import { paths } from "@/paths";

// Auth-routing policy for ArcBase — pure and edge-safe (imported by middleware).
// ArcBase is single-tenant: authorization collapses to authenticated-vs-not
// (ADR 0007). Every route except the public set below requires a session.

/**
 * Routes reachable without a session: the login screen, the auth callback, and
 * the password-reset flow (the recovery link establishes a session, so the
 * update-password page must stay reachable while "authenticated").
 */
export const PUBLIC_ROUTES: readonly string[] = [
  paths.login,
  paths.auth.callback,
  paths.auth.resetPassword,
  paths.auth.updatePassword,
];

/** True when `pathname` is a public route (exact match or a nested sub-path). */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export type RouteDecision = { type: "pass" } | { type: "redirect"; to: string };

/**
 * Pure auth-gating decision. `isAuthed` is whether a session exists.
 * - A signed-in user on `/login` is sent to the home dashboard.
 * - Public routes are always reachable.
 * - Every other route requires a session; otherwise redirect to `/login`.
 */
export function routeAccess(pathname: string, isAuthed: boolean): RouteDecision {
  if (isAuthed && (pathname === paths.login || pathname === `${paths.login}/`)) {
    return { type: "redirect", to: paths.home };
  }
  if (isPublicRoute(pathname)) {
    return { type: "pass" };
  }
  if (!isAuthed) {
    return { type: "redirect", to: paths.login };
  }
  return { type: "pass" };
}
