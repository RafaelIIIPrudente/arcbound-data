"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
import { setClientServices } from "@/services/arcbound-services";
import { createClient } from "@/services/clients";

// Clients are immutable (ADR 0007, invariant #2) — this file exposes only a
// create action. There is deliberately no update or delete action.
//
// ⚠️ REGISTERING A CLIENT IS ADMIN-ONLY (ADR 0013), AND THE GUARD RUNS FIRST —
// BEFORE VALIDATION, NOT AFTER IT.
//
// A Client is the identity every downstream row attributes to, and a wrong or
// duplicated one splits a person's history with no merge tool to put it back.
// Ordering matters beyond taste: a guard placed after `safeParse` would hand a
// non-admin tidy field-level feedback on a form they were never permitted to
// submit. Refusal precedes every other branch.
//
// The RLS policy on `public.clients` ("arcbase add clients", with_check
// `public.is_admin()`) is the other half and is NOT redundant: it refuses a
// caller who bypasses this action and uses their own Supabase token.

const clientSchema = z.object({
  name: z.string().min(1, "Name is required."),
  linkedin_url: z.string().min(1, "LinkedIn URL is required."),
});

/**
 * ⚠️ FOUR OUTCOMES, BECAUSE THERE ARE FOUR DIFFERENT THINGS THAT CAN HAVE HAPPENED.
 *
 * Registering a Client is now two writes — the Client, then its Services — and the
 * second can fail on its own. Collapsing that into `ok: true/false` would tell the
 * admin something untrue in both directions:
 *   • `created`                 — Client registered with the Services chosen.
 *   • `created_without_services`— Client registered; the admin chose none. Valid,
 *     but it cannot receive uploads until one is assigned, so it must SAY that.
 *   • `created_services_failed` — Client EXISTS, Services did not save. Not
 *     success (it is broken on arrival) and not failure (retrying would create a
 *     duplicate — there is no unique constraint on clients, ADR 0009).
 *   • `error`                   — nothing was created.
 *
 * ADR 0014's invite flow is the precedent for the three-way result.
 */
export type ClientFormState =
  | { status: "idle" }
  | { status: "error"; errors?: Record<string, string[]>; message?: string }
  | { status: "created"; clientId: string; message: string }
  | { status: "created_without_services"; clientId: string; message: string }
  | { status: "created_services_failed"; clientId: string; message: string };

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireAdmin();

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", errors: parsed.error.flatten().fieldErrors };
  }

  // Validate the URL shape before touching the seam (per AGENTS.md).
  const normalized = normalizeLinkedInUrl(parsed.data.linkedin_url);
  if (!normalized.ok) {
    return { status: "error", errors: { linkedin_url: [normalized.message] } };
  }

  // ⚠️ `getAll`, NEVER `Object.fromEntries` FOR THIS FIELD. A repeated form field
  // collapses to its LAST value under `fromEntries`, which would quietly reduce a
  // three-service selection to one.
  const serviceIds = formData
    .getAll("service_id")
    .filter((v): v is string => typeof v === "string");

  // ⚠️ THE CLIENT IS CREATED FIRST, AND THAT IS A FOREIGN KEY, NOT A PREFERENCE.
  // `client_services.client_id` references `clients(id)`, so the Client must exist
  // before its Services can be written. The id comes from the row `createClient()`
  // returns — it is not guessed, and it is not discarded.
  //
  // No app-side dedup — this external schema has no unique constraint on clients
  // (ADR 0009). We validate the URL shape and store it; duplicates aren't blocked.
  let client;
  try {
    client = await createClient({ name: parsed.data.name, linkedin_url: normalized.value });
  } catch (err) {
    // Nothing was created, so this is a plain failure and a retry is safe.
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (serviceIds.length === 0) {
    // No redirect: the modal closes and the list refreshes in place.
    revalidatePath(paths.clients.list);
    return {
      status: "created_without_services",
      clientId: client.id,
      message: `${client.name} was registered, but has no services yet and cannot receive uploads until one is assigned.`,
    };
  }

  try {
    await setClientServices(client.id, serviceIds);
  } catch (err) {
    // ⚠️ PARTIAL SUCCESS. The Client EXISTS and cannot be un-created; only the
    // assignment failed. Reporting a plain error here would invite a retry that
    // creates a SECOND client. Reporting plain success would hide a client that is
    // broken on arrival. Name the consequence and where to fix it.
    revalidatePath(paths.clients.list);
    return {
      status: "created_services_failed",
      clientId: client.id,
      message: `${client.name} was registered, but its services could not be saved (${
        err instanceof Error ? err.message : String(err)
      }). It cannot receive uploads until you assign them on the client's overview.`,
    };
  }

  revalidatePath(paths.clients.list);
  return {
    status: "created",
    clientId: client.id,
    message: `${client.name} was registered.`,
  };
}
