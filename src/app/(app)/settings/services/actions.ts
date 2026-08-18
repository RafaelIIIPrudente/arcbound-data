"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { HANDLER_VALUES } from "@/app/(app)/settings/services/handler-labels";
import { requireAdmin } from "@/lib/auth/roles";
import { failure, firstIssue, idSchema, type ActionState } from "@/lib/server-actions";
import { paths } from "@/paths";
import {
  createService,
  deleteService,
  setServiceStatus,
  updateService,
} from "@/services/arcbound-services";

// ─────────────────────────────────────────────────────────────────────────────
// Arcbound Services registry actions (ADR 0015). Admin-only, twice over: every
// action calls `requireAdmin()`, and every RPC behind them re-checks
// `public.is_admin()` in SQL — so a caller who skips the app and uses their own
// Supabase token is still refused.
//
// ⚠️ `await requireAdmin()` IS THE FIRST STATEMENT OF EACH ACTION AND SITS OUTSIDE
// THE try. These actions catch failures deliberately — that is how the database's
// refusals (the delete guard, the one-Service-per-handler index) reach the screen
// — so a guard inside the try would be caught too, and the denial would render as
// a message reading "NEXT_REDIRECT" instead of redirecting.
//
// ⚠️ NO DATABASE INVARIANT IS RE-IMPLEMENTED HERE. Not the delete guard, not the
// handler's immutability, not the unique-handler rule. Each action asks and
// reports the answer verbatim — including the engagement count that
// `delete_service` puts in its message, which is the only reason that message is
// worth showing.
// ─────────────────────────────────────────────────────────────────────────────

/** ⚠️ AN ALIAS — see `lib/server-actions.ts`, which now owns this union. */
export type ServiceActionState = ActionState;

/**
 * ⚠️ AN UNSELECTED PIPELINE ARRIVES AS `""`, NOT `null`.
 *
 * HTML posts an empty string for an unchosen `<select>`. `''` is not a legal
 * handler, so passing it through would make the CHECK constraint reject the most
 * ordinary case there is — a listed offering with no pipeline — and show the admin
 * a constraint error for doing something entirely valid. Normalising here is what
 * keeps "no pipeline" a first-class choice rather than a failure.
 */
const handlerField = z
  .union([z.literal(""), z.enum(HANDLER_VALUES)])
  .transform((value) => (value === "" ? null : value));

/** Optional free text: `""` from a form means "not provided", never a value. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9-]+$/, "Slug may use lowercase letters, numbers and hyphens only."),
  description: optionalText,
  handler: handlerField,
});

const updateSchema = z.object({
  id: z.string().uuid("Select a valid service."),
  name: z.string().trim().min(1, "Name is required."),
  description: optionalText,
  sort_order: z.coerce.number().int("Sort order must be a whole number."),
});

const statusSchema = z.object({
  id: z.string().uuid("Select a valid service."),
  status: z.enum(["active", "archived"], { message: "Status must be active or archived." }),
});

const deleteSchema = idSchema("Select a valid service.");

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin();

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await createService({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      handler: parsed.data.handler,
    });
    revalidatePath(paths.settings.services);
    return { status: "saved", message: `${parsed.data.name} added.` };
  } catch (err) {
    return failure(err);
  }
}

/**
 * ⚠️ THERE IS NO HANDLER HERE, AND THE FORM CANNOT ADD ONE. `update_service` takes
 * no handler parameter because the handler is immutable after creation — see
 * ADR 0015. The schema below does not read a `handler` field, so an extra input in
 * the posted form is discarded rather than forwarded.
 */
export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin();

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await updateService({
      id: parsed.data.id,
      name: parsed.data.name,
      description: parsed.data.description,
      sortOrder: parsed.data.sort_order,
    });
    revalidatePath(paths.settings.services);
    return { status: "saved", message: "Saved." };
  } catch (err) {
    return failure(err);
  }
}

/** Archive or restore. The reversible retirement path. */
export async function setServiceStatusAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin();

  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await setServiceStatus(parsed.data.id, parsed.data.status);
    revalidatePath(paths.settings.services);
    return {
      status: "saved",
      message: parsed.data.status === "archived" ? "Archived." : "Restored.",
    };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Permanently remove an offering.
 *
 * ⚠️ THIS DOES NOT CHECK WHETHER THE DELETE IS ALLOWED. `delete_service` refuses
 * while any Client receives the Service, and the foreign key refuses independently
 * of that. Counting here first would be a second copy of the rule computed from an
 * already-stale read.
 */
export async function deleteServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin();

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    await deleteService(parsed.data.id);
    revalidatePath(paths.settings.services);
    return { status: "saved", message: "Deleted." };
  } catch (err) {
    return failure(err);
  }
}
