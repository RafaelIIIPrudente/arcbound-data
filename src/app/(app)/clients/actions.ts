"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
import { createClient, DuplicateClientError } from "@/services/clients";

// Clients are immutable (ADR 0007, invariant #2) — this file exposes only a
// create action. There is deliberately no update or delete action.

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
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // Validate the URL shape before touching the seam (per AGENTS.md).
  const normalized = normalizeLinkedInUrl(parsed.data.linkedin_url);
  if (!normalized.ok) {
    return { ok: false, errors: { linkedin_url: [normalized.message] } };
  }

  try {
    await createClient({ name: parsed.data.name, linkedin_url: normalized.value });
  } catch (error) {
    if (error instanceof DuplicateClientError) {
      return {
        ok: false,
        errors: { linkedin_url: ["A client with this LinkedIn profile already exists."] },
      };
    }
    throw error;
  }

  // No redirect: the modal closes and the list refreshes in place.
  revalidatePath(paths.clients.list);
  return { ok: true };
}
