"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { paths } from "@/paths";
import { createResource } from "@/services/resources";

// Resources are view + add only (SRS OI-05) — this file exposes only a create
// action. There is deliberately no update or delete action.

const resourceSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  url: z.string().trim().min(1, "Link is required.").url("Enter a valid URL (including https://)."),
});

export interface ResourceFormState {
  ok: boolean;
  errors?: Record<string, string[]>;
}

export async function createResourceAction(
  _prev: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const parsed = resourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  await createResource(parsed.data);
  revalidatePath(paths.resources);
  return { ok: true };
}
