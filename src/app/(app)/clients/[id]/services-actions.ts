"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { paths } from "@/paths";
import { setClientServices } from "@/services/arcbound-services";

// ─────────────────────────────────────────────────────────────────────────────
// Assign the Services a Client receives (ADR 0015). Admin-only twice over: this
// action calls `requireAdmin()`, and `set_client_services` re-checks
// `public.is_admin()` in SQL.
//
// ⚠️ `await requireAdmin()` IS FIRST AND OUTSIDE THE try. It denies by calling
// `redirect()`, which denies by THROWING — inside the try it would be caught and
// rendered as a message reading "NEXT_REDIRECT" instead of redirecting.
//
// ⚠️ THIS REPLACES THE CLIENT'S WHOLE SET. The form is responsible for submitting
// the complete intended state (see the header of client-services-card.tsx); this
// action forwards it unaltered and adds nothing back. An empty set is legitimate —
// ending an engagement entirely — so it is NOT treated as a validation failure.
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceAssignmentState =
  { status: "idle" } | { status: "saved"; message: string } | { status: "error"; message: string };

const schema = z.object({
  clientId: z.string().uuid("Select a valid client."),
  serviceIds: z.array(z.string().uuid("Select valid services.")),
});

export async function setClientServicesAction(
  _prev: ServiceAssignmentState,
  formData: FormData,
): Promise<ServiceAssignmentState> {
  await requireAdmin();

  // ⚠️ `getAll`, NEVER `Object.fromEntries(formData)`. A repeated field collapses
  // to its LAST value under `fromEntries`, which would silently reduce a
  // three-service submission to one — and since this replaces the whole set, the
  // other two would be deleted with no error and no trace.
  const parsed = schema.safeParse({
    clientId: formData.get("client_id"),
    serviceIds: formData.getAll("service_id"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { clientId, serviceIds } = parsed.data;

  try {
    await setClientServices(clientId, serviceIds);
    revalidatePath(paths.clients.details(clientId));
    return {
      status: "saved",
      message:
        serviceIds.length === 0
          ? "Saved. This client has no services and cannot receive uploads."
          : `Saved. ${serviceIds.length} ${serviceIds.length === 1 ? "service" : "services"} assigned.`,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
