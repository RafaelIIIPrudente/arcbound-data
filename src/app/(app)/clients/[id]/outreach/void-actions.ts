"use server";

import { revalidatePath } from "next/cache";

import { paths } from "@/paths";
import { unvoidOutreachUpload, voidOutreachUpload } from "@/services/outreach";

// ─────────────────────────────────────────────────────────────────────────────
// The void / un-void actions for the snapshot history.
//
// ⚠️ NEITHER ACTION CHECKS PERMISSION, AND NEITHER MAY EVER START. Both RPCs are
// SECURITY DEFINER and enforce `coalesce(uploaded_by = auth.uid(), false) or
// public.is_admin()` inside their own bodies — that check IS the security
// boundary, because RLS does not apply within a definer function. Re-checking it
// here would create a SECOND copy of the rule that can drift from the first,
// while adding nothing: the database refuses either way.
//
// ⚠️ AND NOTHING THE CLIENT SENDS IS TREATED AS PERMISSION. The history computes
// a `canVoid` per row to decide what to SHOW; that value never travels to these
// actions, and if it did it would be worthless — a browser can send anything.
// The only input is an upload id, which is not a capability: presenting one you
// are not entitled to void gets you 42501, the same 42501 as presenting one that
// does not exist. (The RPC conflates those two deliberately, so this action
// cannot be used to probe which uploads exist.)
//
// ⚠️ THE PATH REVALIDATED COMES FROM THE RPC'S OWN RESPONSE, not from an argument
// the caller supplied. A forged `clientId` could otherwise be used to bust an
// unrelated Client's cache; taking it from the returned row means the only page
// refreshed is the one whose data actually changed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the history's buttons get back.
 *
 * ⚠️ `error` CARRIES THE DATABASE'S OWN MESSAGE. A refusal must reach the screen
 * as a refusal — reporting success and leaving the row unchanged is the one
 * outcome this shape exists to prevent.
 */
export type VoidActionResult = { status: "ok" } | { status: "error"; message: string };

/** The two RPCs differ only in direction; everything around them is identical. */
async function run(
  uploadId: string,
  call: (id: string) => Promise<{ clientId: string }>,
): Promise<VoidActionResult> {
  try {
    const { clientId } = await call(uploadId);
    revalidatePath(paths.clients.outreach(clientId));
    return { status: "ok" };
  } catch (error) {
    // ⚠️ THE MESSAGE IS SURFACED, NOT REPLACED WITH A FRIENDLY ONE. "Not yours to
    // void" and "the database is unreachable" call for different responses from
    // the person reading, and a single house-style sentence would hide which
    // they are looking at.
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The snapshot could not be updated.",
    };
  }
}

export async function voidSnapshotAction(uploadId: string): Promise<VoidActionResult> {
  return run(uploadId, voidOutreachUpload);
}

export async function unvoidSnapshotAction(uploadId: string): Promise<VoidActionResult> {
  return run(uploadId, unvoidOutreachUpload);
}
