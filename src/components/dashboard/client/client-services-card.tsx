"use client";

import { useActionState, useId } from "react";

import {
  setClientServicesAction,
  type ServiceAssignmentState,
} from "@/app/(app)/clients/[id]/services-actions";
import { Button } from "@/components/ui/button";
import type { ArcboundService } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The Services a Client receives (ADR 0015). Admin-editable; read-only for a Data
// Analyst, who still sees the assignment because it is information about the
// Client, not authority over it.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ `setClientServices` REPLACES THE ENTIRE SET. IT IS NOT A DELTA.
//
// Whatever this form does not submit is DELETED for that Client. That makes one
// mistake catastrophic and invisible: if the form rendered only ACTIVE Services,
// then a Client holding a Service that S2 has since ARCHIVED would lose it the
// moment anyone saved anything at all — no error, no trace, and the archive design
// exists precisely so retired offerings keep their history.
//
// So the form submits the COMPLETE intended state:
//   • Active Services            → ordinary checkboxes.
//   • Archived AND currently held → rendered, labelled, and CHECKED by default, so
//     an unrelated save carries them through. Still un-tickable on purpose: an
//     assignment nobody could ever undo would be a different bug.
//   • Archived and NOT held      → not offered. Archived means retired; assigning
//     one afresh would resurrect it through a side door.
//
// If you add a category of Service to this file, ask first what happens when it is
// absent from the POST body. The answer is always "it is deleted".
// ═════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: ServiceAssignmentState = { status: "idle" };

/** ⚠️ NOT AN EM DASH — that marker means "could not be read". This is on record. */
function pipelineLabel(service: ArcboundService): string {
  return service.handler === null ? "No data pipeline" : "Has a data pipeline";
}

interface CardViewProps {
  clientId: string;
  /** EVERY Service in the registry, active and archived (`listServices()`). */
  services: ArcboundService[];
  /** The ids this Client currently holds. */
  assignedIds: string[];
  /**
   * ⚠️ REQUIRED, AND DELIBERATELY NOT DEFAULTED — same rule as `ReportLinkCard`.
   * A default would let a new call site forget the question and silently inherit
   * the permissive answer.
   */
  isAdmin: boolean;
  state: ServiceAssignmentState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

export function ClientServicesCardView({
  clientId,
  services,
  assignedIds,
  isAdmin,
  state,
  formAction,
  pending,
}: CardViewProps) {
  const held = new Set(assignedIds);
  const fieldId = useId();

  const active = services.filter((service) => service.status === "active");
  // ⚠️ HELD-AND-ARCHIVED: the category the replace-the-set trap destroys.
  const heldArchived = services.filter(
    (service) => service.status === "archived" && held.has(service.id),
  );
  const offered = [...active, ...heldArchived];
  const assigned = offered.filter((service) => held.has(service.id));

  const header = (
    <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
      <span className="text-primary">—</span>
      Services
    </div>
  );

  // ⚠️ A CLIENT WITH NO SERVICES IS A REAL, VALID STATE — say so, rather than
  // rendering an empty box. Once /upload filters by Services (S4) this Client has
  // no upload path at all, and this card is the only place that is visible.
  const emptyNotice = (
    <p className="text-sm text-muted-foreground">
      No services assigned. This client cannot receive uploads until one is added.
    </p>
  );

  if (!isAdmin) {
    return (
      <section className="space-y-4 rounded-lg border bg-card p-5">
        {header}
        {assigned.length === 0 ? (
          emptyNotice
        ) : (
          <ul className="space-y-2">
            {assigned.map((service) => (
              <li key={service.id} className="text-sm">
                <span className="font-medium">{service.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{pipelineLabel(service)}</span>
                {service.status === "archived" ? (
                  <span className="ml-2 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    Archived
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      {header}

      {assigned.length === 0 ? emptyNotice : null}

      <form action={formAction} className="space-y-4">
        {/* Whose set this is. The action validates it; the FK enforces it. */}
        <input type="hidden" name="client_id" value={clientId} />

        {offered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No services are registered yet. An admin adds them under Settings → Services.
          </p>
        ) : (
          <ul className="space-y-2">
            {offered.map((service) => {
              const inputId = `${fieldId}-${service.id}`;
              return (
                <li key={service.id} className="flex items-start gap-2.5">
                  <input
                    id={inputId}
                    type="checkbox"
                    name="service_id"
                    value={service.id}
                    // ⚠️ `defaultChecked`, NOT `checked` — this is an uncontrolled
                    // form, and the browser submits exactly what is ticked. A held
                    // archived Service starts ticked, so a save that ignores it
                    // still carries it through.
                    defaultChecked={held.has(service.id)}
                    className="mt-1 size-4"
                  />
                  <label htmlFor={inputId} className="text-sm">
                    <span className="font-medium">{service.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {pipelineLabel(service)}
                    </span>
                    {service.status === "archived" ? (
                      <span className="ml-2 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                        Archived
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {state.status === "error" ? (
          <p role="alert" className="text-xs text-destructive">
            {state.message}
          </p>
        ) : null}
        {state.status === "saved" ? (
          <p role="status" className="text-xs text-muted-foreground">
            {state.message}
          </p>
        ) : null}

        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save services"}
        </Button>
      </form>
    </section>
  );
}

/** The mounted card, wired to its action state. */
export function ClientServicesCard({
  clientId,
  services,
  assignedIds,
  isAdmin,
}: {
  clientId: string;
  services: ArcboundService[];
  assignedIds: string[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(setClientServicesAction, IDLE);

  return (
    <ClientServicesCardView
      clientId={clientId}
      services={services}
      assignedIds={assignedIds}
      isAdmin={isAdmin}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}
