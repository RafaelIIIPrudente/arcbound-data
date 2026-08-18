"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { failure, firstIssue, idSchema, type ActionState } from "@/lib/server-actions";
import { paths } from "@/paths";
import { createWriter, deleteWriter, setWriterStatus, updateWriter } from "@/services/writers";

// ─────────────────────────────────────────────────────────────────────────────
// Writers registry actions. Admin-only, twice over: every action calls
// `requireAdmin()`, and every RPC behind them re-checks `public.is_admin()` in
// SQL — so a caller who skips the app and uses their own Supabase token is still
// refused.
//
// ⚠️ `await requireAdmin()` IS THE FIRST STATEMENT OF EACH ACTION AND SITS
// OUTSIDE THE try. These actions catch failures deliberately — that is how the
// database's refusals reach the screen — but `redirect()` denies by THROWING, so
// a guard inside the try would be caught too and the denial would render as a
// message reading "NEXT_REDIRECT" instead of redirecting. This repo has already
// shipped one `try/catch` that would have done exactly that.
//
// ⚠️ NO DATABASE INVARIANT IS RE-IMPLEMENTED HERE. Not the case-insensitive
// uniqueness of names, and not the rule that a writer in use cannot be
// deleted. Each action asks and reports the answer verbatim — including the
// client count that `delete_writer` puts in its message, which is the only
// reason that message is worth showing at all.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ AN ALIAS, NOT A SECOND SHAPE. Every action module in this app answers with
 * the same three states, and they were four private copies of one union until
 * `lib/server-actions.ts` took ownership. The name stays because the call sites
 * read better for it.
 */
export type WriterActionState = ActionState;

const nameField = z.string().trim().min(1, "Name is required.");
const idField = z.string().uuid("Select a valid writer.");

const createSchema = z.object({ name: nameField });
const renameSchema = z.object({ id: idField, name: nameField });
const statusSchema = z.object({
  id: idField,
  // Mirrors the `writers_status_known` CHECK constraint. Both exist on
  // purpose: this one saves a round-trip and gives a readable message; the
  // constraint is the half that cannot be bypassed.
  status: z.enum(["active", "archived"], { message: "Status must be active or archived." }),
});
const deleteSchema = idSchema("Select a valid writer.");

export async function createWriterAction(
  _prev: WriterActionState,
  formData: FormData,
): Promise<WriterActionState> {
  await requireAdmin();

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await createWriter(parsed.data.name);
    revalidatePath(paths.settings.writers);
    return { status: "saved", message: `${parsed.data.name} added.` };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Rename a writer.
 *
 * ⚠️ SAFE IN A WAY RENAMING A CLIENT IS NOT. Clients point at a writer by
 * foreign key, so this moves every label at once and re-attributes nothing.
 */
export async function renameWriterAction(
  _prev: WriterActionState,
  formData: FormData,
): Promise<WriterActionState> {
  await requireAdmin();

  const parsed = renameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await updateWriter(parsed.data.id, parsed.data.name);
    revalidatePath(paths.settings.writers);
    return { status: "saved", message: "Saved." };
  } catch (err) {
    return failure(err);
  }
}

/** Archive or restore. The reversible retirement path. */
export async function setWriterStatusAction(
  _prev: WriterActionState,
  formData: FormData,
): Promise<WriterActionState> {
  await requireAdmin();

  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await setWriterStatus(parsed.data.id, parsed.data.status);
    revalidatePath(paths.settings.writers);
    return {
      status: "saved",
      // ⚠️ THE ARCHIVE CONFIRMATION NAMES THE WAY BACK. "Archived." alone reads
      // like a deletion that happened to be worded gently; saying it can be
      // restored is what makes the two controls mean different things after the
      // fact, not just before it.
      message:
        parsed.data.status === "archived"
          ? "Archived. Clients already recorded against them keep it, and you can restore it at any time."
          : "Restored. It is offered again.",
    };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Permanently remove a writer.
 *
 * ⚠️ THIS DOES NOT CHECK WHETHER THE DELETE IS ALLOWED, AND MUST NOT LEARN TO.
 * `delete_writer` refuses while any Client is recorded against the writer and
 * names the count in its message; the foreign key refuses independently. Testing
 * it here first would be a second copy of that rule computed from an
 * already-stale read — and the copy the admin sees is the one that drifts first.
 */
export async function deleteWriterAction(
  _prev: WriterActionState,
  formData: FormData,
): Promise<WriterActionState> {
  await requireAdmin();

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await deleteWriter(parsed.data.id);
    revalidatePath(paths.settings.writers);
    return { status: "saved", message: "Deleted." };
  } catch (err) {
    // ⚠️ VERBATIM, COUNT AND ALL. `failure` does not rewrite, shorten or
    // generalise: "cannot delete: 3 client(s) are still recorded against this
    // writer" tells an admin what to do next, and "Cannot delete" does not.
    return failure(err);
  }
}
