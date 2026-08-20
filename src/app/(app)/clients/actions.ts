"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { optionalUuidOrAbsent } from "@/lib/server-actions";
import { paths } from "@/paths";
import { setClientServices } from "@/services/arcbound-services";
import { createClient } from "@/services/clients";

// ⚠️ THIS FILE'S OLD HEADER SAID CLIENTS WERE IMMUTABLE. THAT IS NO LONGER TRUE.
//
// It read: "Clients are immutable (ADR 0007, invariant #2) — this file exposes
// only a create action. There is deliberately no update or delete action."
// S4 falsified it. Two columns are now admin-mutable — `industry_id` and
// `writer_id` — through `setClientIndustryWriterAction` in
// `clients/[id]/industry-writer-actions.ts`.
//
// ADR 0007's own words still hold literally: `public.clients` has no update or
// delete POLICY, so nothing writes the table directly. What changed is the
// invariant that sentence was enforcing. The half that actually protects
// attribution is untouched and is enforced by construction, not by convention:
// `name` and `linkedin_url` are named by no write path in this application.
//
// ⚠️ THE ORIGINAL REASON HAS RETIRED, AND THE RULE OUTLIVED IT. `name` was the
// key an externally-owned view joined scraped posts on, so editing it silently
// re-attributed or stranded a Client's whole history. Attribution is a foreign
// key now (ADR 0010) and editing the name moves nothing. What remains is smaller
// but real: `name` is the label on every report a Client reads and the value the
// upload-time wrong-file guard compares against, so it is still not something a
// form should be able to change by accident.
//
// (A narrowing of ADR 0007, like the one report links applied to the same ADR.
// Recorded in docs/decisions/2026-08-18-client-industry-and-writer.md.)
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
 * Industry and Writer at registration. Both OPTIONAL — "not recorded" is a
 * legitimate answer, and an unset picker posts `""`.
 *
 * ⚠️ NO PRESENCE CHECK HERE, UNLIKE THE EDIT ACTION, AND THE ASYMMETRY IS
 * DELIBERATE. On the edit path an absent field is indistinguishable from a
 * deliberate clear, so it is refused. A Client being registered has no current
 * value to lose: absent and empty mean the same thing, and both are true.
 */
const captureSchema = z.object({
  industry_id: optionalUuidOrAbsent("Select a valid industry."),
  writer_id: optionalUuidOrAbsent("Select a valid writer."),
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
  // ⚠️ PARSED SEPARATELY FROM `Object.fromEntries` ABOVE, because these two are
  // optional and that schema is not. A bad id is refused before the insert rather
  // than surfacing as a foreign-key violation nobody can act on.
  const capture = captureSchema.safeParse({
    industry_id: formData.get("industry_id"),
    writer_id: formData.get("writer_id"),
  });
  if (!capture.success) {
    return { status: "error", message: capture.error.issues[0]?.message ?? "Invalid request." };
  }

  let client;
  try {
    // ⚠️ BOTH FIELDS RIDE IN THE SAME INSERT (D7) — NOT a follow-up call to
    // `set_client_industry_writer`. A second write would add a fifth outcome to
    // the four below: a Client that exists, with services, but silently missing
    // the industry and writer the admin chose. One statement cannot half-succeed.
    client = await createClient({
      name: parsed.data.name,
      linkedin_url: normalized.value,
      industry_id: capture.data.industry_id,
      writer_id: capture.data.writer_id,
    });
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
