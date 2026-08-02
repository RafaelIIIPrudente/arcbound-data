"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
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

export interface ClientFormState {
  ok: boolean;
  errors?: Record<string, string[]>;
}

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireAdmin();

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // Validate the URL shape before touching the seam (per AGENTS.md).
  const normalized = normalizeLinkedInUrl(parsed.data.linkedin_url);
  if (!normalized.ok) {
    return { ok: false, errors: { linkedin_url: [normalized.message] } };
  }

  // No app-side dedup — this external schema has no unique constraint on clients
  // (ADR 0009). We validate the URL shape and store it; duplicates aren't blocked.
  await createClient({ name: parsed.data.name, linkedin_url: normalized.value });

  // No redirect: the modal closes and the list refreshes in place.
  revalidatePath(paths.clients.list);
  return { ok: true };
}
