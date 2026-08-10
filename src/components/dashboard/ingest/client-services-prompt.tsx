"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  setClientServicesAction,
  type ServiceAssignmentState,
} from "@/app/(app)/clients/[id]/services-actions";
import { Button } from "@/components/ui/button";
import { paths } from "@/paths";
import type { ArcboundService } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The no-Services branch of /upload: this Client has no Arcbound Services, so
// there are no upload tabs, and this says why (ADR 0015).
//
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ AN ANALYST MUST NEVER BE OFFERED THE ASSIGN FORM. THIS IS THE WHOLE POINT.
//
// `/upload` is NOT admin-gated — a Data Analyst reaches it and runs the weekly
// upload. But `setClientServicesAction` opens with `requireAdmin()`, which denies
// by calling `redirect()`: it DENIES BY THROWING. An analyst who pressed an assign
// button here would not see an error they could read and recover from — they would
// be thrown off the upload page entirely, mid-routine, with no explanation and no
// way back to what they were doing.
//
// So the branch is not "disable the button" or "show an error afterwards". For a
// non-admin there is NO form, NO checkbox and NO submit in the tree at all. They
// get the FACT (this Client has no services, which is why there are no tabs) and
// the ROUTE TO A FIX (an admin can assign them, here is the link). Information is
// not authority, and withholding the control is not the same as withholding the
// truth.
// ═════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: ServiceAssignmentState = { status: "idle" };

interface PromptViewProps {
  clientId: string;
  clientName: string;
  /** The registry. Only ACTIVE services are assignable here. */
  services: ArcboundService[];
  /**
   * ⚠️ REQUIRED, AND DELIBERATELY NOT DEFAULTED. A default would let a future call
   * site forget the question and inherit the permissive answer — which here means
   * handing an analyst a control that redirects them out of their own workflow.
   */
  isAdmin: boolean;
  state: ServiceAssignmentState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

export function ClientServicesPromptView({
  clientId,
  clientName,
  services,
  isAdmin,
  state,
  formAction,
  pending,
}: PromptViewProps) {
  // ⚠️ ARCHIVED SERVICES ARE NOT OFFERED. This Client holds nothing, so unlike the
  // Client Overview there is no existing engagement to preserve — offering a
  // retired offering here would be assigning it afresh.
  const assignable = services.filter((service) => service.status === "active");

  const fact = (
    <>
      <p className="text-sm font-medium">No services assigned to {clientName}.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Uploads attach to a service, so there is nothing to upload here until this client has at
        least one.
      </p>
    </>
  );

  if (!isAdmin) {
    return (
      <section className="rounded-lg border bg-card p-5">
        {fact}
        <p className="mt-3 text-sm text-muted-foreground">
          An admin can assign them on{" "}
          <Link
            href={paths.clients.details(clientId)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            this client&apos;s overview
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      {fact}

      {assignable.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No services are registered yet. Add them under Settings → Services, then come back.
        </p>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="client_id" value={clientId} />

          <ul className="space-y-2">
            {assignable.map((service) => (
              <li key={service.id} className="flex items-center gap-2.5">
                <input
                  id={`assign-${service.id}`}
                  type="checkbox"
                  name="service_id"
                  value={service.id}
                  className="size-4"
                />
                <label htmlFor={`assign-${service.id}`} className="text-sm">
                  {service.name}
                </label>
              </li>
            ))}
          </ul>

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

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Assigning…" : "Assign services"}
          </Button>
        </form>
      )}
    </section>
  );
}

/** The mounted prompt, wired to its action state. */
export function ClientServicesPrompt({
  clientId,
  clientName,
  services,
  isAdmin,
}: {
  clientId: string;
  clientName: string;
  services: ArcboundService[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(setClientServicesAction, IDLE);

  return (
    <ClientServicesPromptView
      clientId={clientId}
      clientName={clientName}
      services={services}
      isAdmin={isAdmin}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}
