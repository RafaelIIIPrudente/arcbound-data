"use client";

import { useActionState, useId, useState } from "react";

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

/**
 * A set of Service ids as one comparable string, order-independent.
 *
 * ⚠️ THE UNIT OF COMPARISON IS THE SET, NOT "DID THE USER CLICK SOMETHING". Those
 * are different questions, and only the first belongs on a Save button: tick a box
 * and untick it again and there is nothing to save, however many clicks happened.
 *
 * SORTED, because the browser submits in DOM order and a reordered registry
 * would otherwise read as a change nobody made. Joined on NUL, written as an
 * ESCAPE rather than a raw byte — a literal NUL in the source makes git treat
 * this file as binary and renders the diff unreviewable. No uuid contains it, so
 * no two ids can run together into a third spelling.
 */
function selectionKey(ids: Iterable<string>): string {
  return [...ids].sort().join("\u0000");
}

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

  // ── is there anything to save? ─────────────────────────────────────────────
  //
  // ⚠️ TRACKED WITHOUT TAKING OWNERSHIP OF THE INPUTS. The checkboxes stay
  // `defaultChecked` (see the ⚠️ on the input below) because this form REPLACES
  // the whole set, and the browser posting exactly what is on screen is what
  // carries a held-but-archived Service through an unrelated save. So nothing
  // here is a `useState` per checkbox — the form's own `onChange` reads the
  // submitted set back off the DOM and reduces it to ONE string. React never
  // writes `checked`; the browser stays the owner of every tick.
  //
  // The baseline is what the form WOULD post untouched, which is `assigned`
  // (offered ∩ held) rather than `assignedIds` — an archived id the registry no
  // longer offers is not in the form and must not count toward the comparison.
  const savedKey = selectionKey(assigned.map((service) => service.id));
  const [baseline, setBaseline] = useState(savedKey);
  const [selection, setSelection] = useState(savedKey);
  const [settled, setSettled] = useState<ServiceAssignmentState | null>(null);

  // ⚠️ RE-BASELINE ON A COMPLETED SAVE, OR THE BUG COMES BACK ONE LAYER UP. If
  // the baseline stayed at the originally-rendered set, the button would re-enable
  // permanently the moment anything was saved.
  //
  // ⚠️ KEYED ON THE STATE OBJECT'S IDENTITY, NOT ON `status`. `useActionState`
  // hands back a NEW object per completed action and the SAME one across ordinary
  // re-renders, so this fires once per save. Comparing `status` alone would
  // re-baseline on every render while the card sat in its saved state — which
  // would silently mark a freshly-ticked box as "nothing to save", the original
  // defect wearing the fix as a disguise.
  if (state.status === "saved" && state !== settled) {
    setSettled(state);
    setBaseline(selection);
  }

  const dirty = selection !== baseline;

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

      <form
        action={formAction}
        // Change events from the checkboxes bubble to here, so ONE listener reads
        // the whole submitted set. No per-input handler, and no per-input state.
        onChange={(event) =>
          setSelection(
            selectionKey(new FormData(event.currentTarget).getAll("service_id").map(String)),
          )
        }
        className="space-y-4"
      >
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
        {/* ⚠️ ONLY WHILE IT IS STILL TRUE. "Saved." is a claim about the selection
            ON SCREEN, so the moment the user ticks something new it becomes a lie
            and must go. This is the other half of the fix: a stale success message
            beside a live Save button is what made the card unreadable, and hiding
            the message and disabling the button are driven by the SAME flag so the
            two can never contradict each other. */}
        {state.status === "saved" && !dirty ? (
          <p role="status" className="text-xs text-muted-foreground">
            {state.message}
          </p>
        ) : null}

        {/* ⚠️ DISABLED WHEN THE TICKED SET ALREADY IS THE SAVED SET — never because
            the set is EMPTY. Deselecting every Service is a legitimate change an
            admin must be able to save; "nothing ticked" and "nothing to do" are
            different states and only the second one blocks the button. */}
        <Button type="submit" variant="outline" size="sm" disabled={pending || !dirty}>
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
