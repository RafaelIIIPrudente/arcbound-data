// ─────────────────────────────────────────────────────────────────────────────
// WHO DID THIS, AND MAY I UNDO IT — the two questions the snapshot history asks
// of every row.
//
// ⚠️ NO `"use client"` IN THIS FILE, AND THAT IS LOAD-BEARING. Both functions are
// called from the Outreach page, which is a Server Component. A `"use client"`
// directive converts EVERY export of a module into a client reference, so
// `canVoidSnapshot(...)` would become a proxy and throw on first use at request
// time — invisible to `next build` (dynamic routes never execute) and invisible
// to Vitest (the directive is inert there). That exact crash shipped once
// already on the dashboard; `src/rsc-boundary.test.ts` exists because of it.
// The interactive history component imports these too, which is fine: a Server
// Component module may be imported by a Client Component, never the reverse.
//
// ⚠️ EVERYTHING HERE IS AFFORDANCE, NOT AUTHORISATION. `canVoidSnapshot` decides
// what to SHOW. What is ALLOWED is decided by `void_outreach_upload` /
// `unvoid_outreach_upload`, which are SECURITY DEFINER — RLS does not apply
// inside them, so their own `coalesce(uploaded_by = auth.uid(), false) or
// public.is_admin()` is the entire security boundary. Nothing computed in this
// file protects a row, and no value derived from it may ever be trusted by the
// server action as permission.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who a recorded uuid belongs to, from the reader's point of view.
 *
 * ⚠️ THREE OUTCOMES, NOT TWO. Q6 settled "You" vs "Another user" because staff
 * identities are not resolvable (D2: `staff_roles` carries no name or email, its
 * RLS is own-row, and `auth.users` is unreadable by `authenticated`). But
 * `uploaded_by` and `voided_by` are NULLABLE, and a null is a third answer:
 * nobody was recorded. Calling that "Another user" asserts a person who may not
 * exist and sends the reader looking for a colleague to ask.
 */
export type Attribution = "you" | "another" | "unrecorded";

/**
 * `null` → `unrecorded`, the current user → `you`, anything else → `another`.
 *
 * ⚠️ THE NULL CHECK COMES FIRST, DELIBERATELY. If both the row's uuid and the
 * signed-in user are null, `userId === currentUserId` is `true` in JavaScript —
 * which would attribute an unattributed row to whoever happens to be looking.
 */
export function attribute(userId: string | null, currentUserId: string | null): Attribution {
  if (userId === null) return "unrecorded";
  if (currentUserId !== null && userId === currentUserId) return "you";
  return "another";
}

/**
 * Should this row be OFFERED a void / un-void control?
 *
 * Mirrors the RPC's predicate so the screen does not offer an action the
 * database will refuse — `uploaded_by = auth.uid()` OR `is_admin()`.
 *
 * ⚠️ A NULL UPLOADER MATCHES NOBODY, and that is the whole reason this is a
 * function rather than an inline `===`. The RPC wraps its comparison in
 * `coalesce(..., false)`, so for a row with no recorded uploader a non-admin is
 * refused every single time. Offering them a button would produce a 42501 on
 * every press, which teaches staff that the app is broken rather than that the
 * row is not theirs. An ADMIN still gets the control: `is_admin()` is the second
 * arm, and without it nobody could ever correct a snapshot written from the SQL
 * editor.
 *
 * ⚠️ AGAIN: THIS DECIDES WHAT TO SHOW. It is not consulted by the server action,
 * and a caller who forges a request past it is refused by the database exactly
 * as they would have been anyway.
 */
export function canVoidSnapshot(
  uploadedBy: string | null,
  currentUserId: string | null,
  admin: boolean,
): boolean {
  if (admin) return true;
  // Either null and the comparison below would be meaningless — or, worse,
  // accidentally true. The database answers `false` for both; so do we.
  if (uploadedBy === null || currentUserId === null) return false;
  return uploadedBy === currentUserId;
}
