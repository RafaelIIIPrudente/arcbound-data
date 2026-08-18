import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// THE SHAPE EVERY SERVER ACTION IN THIS APP RETURNS, IN ONE PLACE.
//
// Four action modules had grown their own private copy of the same three
// things — a three-state union, a "first zod issue" reader, and an error
// wrapper that passes the DATABASE'S OWN MESSAGE through untouched. They were
// identical, so the copies could only ever drift apart, never together.
//
// ⚠️ `failure()` DOES NOT REWRITE, SHORTEN OR GENERALISE. "cannot delete: 3
// client(s) are still recorded in this industry" tells an admin what to do
// next; "Cannot delete" does not. Every action in this app reports the
// database's refusal verbatim, and that rule now lives in exactly one function.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a `useActionState` action hands back.
 *
 * ⚠️ THREE STATES, NOT TWO. "idle" is not "saved": a form that has never been
 * submitted must not render a success message, and one that failed must not
 * render silence.
 */
export type ActionState =
  { status: "idle" } | { status: "saved"; message: string } | { status: "error"; message: string };

/** The first validation message, or a generic one if zod somehow reported none. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}

/** An action failure carrying the underlying message VERBATIM. */
export function failure(err: unknown): ActionState {
  return { status: "error", message: err instanceof Error ? err.message : String(err) };
}

/** The `{ id }` form payload every delete/select-one action posts. */
export function idSchema(label: string) {
  return z.object({ id: z.string().uuid(label) });
}

/** A uuid from a `<select>`, which posts `""` when nothing is chosen. */
const uuidOrEmpty = (label: string) => z.union([z.literal(""), z.string().uuid(label)]);

/**
 * An optional uuid field: `""` means "not recorded", which is a real answer.
 *
 * ⚠️ AN ABSENT KEY IS NOT ACCEPTED. On an EDIT path a missing field and a
 * deliberate clear are indistinguishable once both become `null`, and the RPC
 * behind those paths applies every argument it is given — so a form that
 * silently dropped a field would erase it. Absence must be refused loudly by
 * the caller; see `optionalUuidOrAbsent` for the one place it is legitimate.
 */
export const optionalUuid = (label: string) =>
  uuidOrEmpty(label).transform((value) => (value === "" ? null : value));

/**
 * The same field, tolerating an ABSENT key as well as an empty one.
 *
 * ⚠️ FOR CREATION ONLY, AND THE ASYMMETRY IS THE POINT. A record being
 * registered has no current value to lose, so absent and empty mean the same
 * thing and both are true. Using this on an edit path would turn a broken form
 * into a silent wipe.
 */
export const optionalUuidOrAbsent = (label: string) =>
  uuidOrEmpty(label)
    .nullish()
    .transform((value) => (value ? value : null));
