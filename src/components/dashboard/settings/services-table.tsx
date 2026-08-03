"use client";

import { useActionState, useId, useState } from "react";

import {
  createServiceAction,
  deleteServiceAction,
  setServiceStatusAction,
  type ServiceActionState,
} from "@/app/(app)/settings/services/actions";
import { HANDLER_LABELS } from "@/app/(app)/settings/services/handler-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArcboundServiceAdminRow } from "@/services/arcbound-services";

// ─────────────────────────────────────────────────────────────────────────────
// The Arcbound Services registry (ADR 0015). Admin-only — the page calls
// `requireAdmin()` before this renders.
//
// ⚠️ FRICTION IS SCALED TO BLAST RADIUS, AND SPENT RATHER THAN SPRINKLED.
//
// A confirmation on every control teaches people to click through confirmations,
// which costs exactly the protection it was meant to buy. So:
//   • Rename / re-order — no confirmation. Reversible, invisible to Clients.
//   • Archive a Service with NO pipeline — no confirmation. Nothing stops flowing.
//   • Archive a Service WITH a pipeline — type the name. This removes the upload
//     path for everyone receiving it, and the panel names how many that is.
//   • Delete — offered only when the database says it is possible, and the reason
//     is stated when it is not.
//
// ⚠️ NO DATABASE INVARIANT IS RE-DERIVED IN THIS FILE. `canDelete` comes from the
// row; this component never recomputes it from `clientCount`. The moment the
// database's rule gains a condition the UI has not heard about, a local copy would
// start offering deletes that get refused, or hiding ones that would have worked.
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: ServiceActionState = { status: "idle" };

/** What reads under a Service's name. NULL is a decision, not a gap. */
function pipelineLabel(service: ArcboundServiceAdminRow): string {
  // ⚠️ NOT AN EM DASH. This codebase reserves "—" for "could not compute". A
  // Service with no handler is a listed offering whose lack of a pipeline is
  // deliberate — saying "—" would report a missing value instead of a real state.
  return service.handler === null ? "No data pipeline" : HANDLER_LABELS[service.handler];
}

interface RowViewProps {
  service: ArcboundServiceAdminRow;
  state: ServiceActionState;
  statusAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
  pending: boolean;
}

/** Pure(ish) render of one registry row — testable without firing server actions. */
export function ServiceRowView({
  service,
  state,
  statusAction,
  deleteAction,
  pending,
}: RowViewProps) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const panelId = useId();
  const deleteReasonId = useId();

  const archived = service.status === "archived";
  // ⚠️ THE ONE LINE THAT DECIDES DELETE. Straight from the row — see the file
  // header. Never `service.clientCount === 0`.
  const canDelete = service.canDelete;
  // Only a Service with a pipeline can break an upload path by being archived.
  const needsTypedConfirmation = service.handler !== null;
  const nameMatches = typed.trim() === service.name;

  function openArchive() {
    setTyped("");
    setConfirming(true);
  }

  return (
    <div className="space-y-3 border-b px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {service.name}
            {archived ? (
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Archived
              </span>
            ) : null}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {service.slug} · {pipelineLabel(service)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {service.clientCount} {service.clientCount === 1 ? "client" : "clients"} ·{" "}
            {service.uploadCount} {service.uploadCount === 1 ? "upload" : "uploads"}
          </p>
          {service.description ? (
            <p className="mt-1.5 text-sm text-muted-foreground">{service.description}</p>
          ) : null}

          {state.status === "error" ? (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              {state.message}
            </p>
          ) : null}
          {state.status === "saved" ? (
            <p role="status" className="mt-1.5 text-xs text-muted-foreground">
              {state.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {archived ? (
            <form action={statusAction}>
              <input type="hidden" name="id" value={service.id} />
              <input type="hidden" name="status" value="active" />
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                Restore
              </Button>
            </form>
          ) : needsTypedConfirmation ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openArchive}
              aria-expanded={confirming}
              aria-controls={panelId}
            >
              Archive
            </Button>
          ) : (
            // No pipeline: archiving breaks nothing, so it submits directly.
            <form action={statusAction}>
              <input type="hidden" name="id" value={service.id} />
              <input type="hidden" name="status" value="archived" />
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                Archive
              </Button>
            </form>
          )}

          <form action={deleteAction}>
            <input type="hidden" name="id" value={service.id} />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={!canDelete || pending}
              aria-describedby={canDelete ? undefined : deleteReasonId}
            >
              Delete
            </Button>
          </form>
        </div>
      </div>

      {/* The reason a disabled Delete is disabled. A greyed-out control with no
          explanation trains people to ignore greyed-out controls. */}
      {canDelete ? null : (
        <p id={deleteReasonId} className="text-xs text-muted-foreground">
          {service.clientCount} {service.clientCount === 1 ? "client" : "clients"} still receive
          this service. Archive it instead, or remove it from those clients first.
        </p>
      )}

      {confirming && !archived && needsTypedConfirmation ? (
        <div
          id={panelId}
          role="group"
          aria-label={`Archive ${service.name}`}
          className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
          {/* ⚠️ EVERY NUMBER HERE COMES FROM THE ROW. A generic warning is one the
              reader has already learned to dismiss; the count of who is affected is
              what makes this one worth reading. */}
          <p className="text-sm">
            Archiving <strong>{service.name}</strong> removes the upload path for{" "}
            <strong>
              {service.clientCount} {service.clientCount === 1 ? "client" : "clients"}
            </strong>
            . The{" "}
            <strong>
              {service.uploadCount} {service.uploadCount === 1 ? "upload" : "uploads"}
            </strong>{" "}
            already ingested through it are kept, and nothing is deleted. You can restore it
            afterwards.
          </p>

          <label className="block text-xs text-muted-foreground" htmlFor={`${panelId}-confirm`}>
            Type <strong>{service.name}</strong> to confirm.
          </label>
          <Input
            id={`${panelId}-confirm`}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />

          <div className="flex items-center gap-2">
            <form action={statusAction}>
              <input type="hidden" name="id" value={service.id} />
              <input type="hidden" name="status" value="archived" />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={!nameMatches || pending}
              >
                Archive {service.name}
              </Button>
            </form>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One row, wired to its own action state so rows fail independently. */
function ServiceRow({ service }: { service: ArcboundServiceAdminRow }) {
  const [statusState, statusAction, statusPending] = useActionState(setServiceStatusAction, IDLE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteServiceAction, IDLE);

  // Whichever of the two last said something is what this row reports.
  const state = deleteState.status !== "idle" ? deleteState : statusState;

  return (
    <ServiceRowView
      service={service}
      state={state}
      statusAction={statusAction}
      deleteAction={deleteAction}
      pending={statusPending || deletePending}
    />
  );
}

interface CreateViewProps {
  state: ServiceActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

/** Register a new offering. */
export function CreateServiceFormView({ state, formAction, pending }: CreateViewProps) {
  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Add a service
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="service-name" className="sr-only">
            Service name
          </label>
          <Input id="service-name" name="name" placeholder="LinkedIn Growth" autoComplete="off" />
        </div>
        <div className="min-w-[150px] flex-1">
          <label htmlFor="service-slug" className="sr-only">
            Slug
          </label>
          <Input id="service-slug" name="slug" placeholder="linkedin-growth" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="service-handler" className="sr-only">
            Data pipeline
          </label>
          <select
            id="service-handler"
            name="handler"
            // ⚠️ "No data pipeline" IS THE DEFAULT, AND IT IS A REAL CHOICE. Most
            // offerings Arcbound sells have no ingestion behind them; making one of
            // the two pipelines the default would attach code to a listing by
            // accident, and only one Service may claim each pipeline.
            defaultValue=""
            className="h-9 rounded-md border bg-transparent px-2.5 text-sm"
          >
            <option value="">No data pipeline</option>
            {Object.entries(HANDLER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add service"}
        </Button>
      </div>

      <div>
        <label htmlFor="service-description" className="sr-only">
          Description
        </label>
        <Input
          id="service-description"
          name="description"
          placeholder="What this service is (optional)"
          autoComplete="off"
        />
      </div>

      {state.status === "saved" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function CreateServiceForm() {
  const [state, formAction, pending] = useActionState(createServiceAction, IDLE);
  return <CreateServiceFormView state={state} formAction={formAction} pending={pending} />;
}

/**
 * The registry read.
 *
 * ⚠️ `unavailable` IS ITS OWN STATE, NOT AN EMPTY LIST. An empty registry is a true
 * statement about Arcbound — nothing is registered. A failed read is a statement
 * about ArcBase — we do not know. Collapsing them would tell an admin the registry
 * is empty at the moment it might be full and unreachable, and the fix for each is
 * different.
 */
export type ServicesRegistry =
  { status: "ok"; services: ArcboundServiceAdminRow[] } | { status: "unavailable" };

export function ServicesTableView({ registry }: { registry: ServicesRegistry }) {
  if (registry.status === "unavailable") {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
      >
        The service registry could not be read. This is not the same as it being empty — do not add
        services until it loads, or you may create duplicates.
      </p>
    );
  }

  if (registry.services.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No services registered yet. Add the offerings Arcbound sells above.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {registry.services.map((service) => (
        <ServiceRow key={service.id} service={service} />
      ))}
    </div>
  );
}

/** The whole screen body: the add form, then the registry. */
export function ServicesTable({ registry }: { registry: ServicesRegistry }) {
  return (
    <div className="space-y-4">
      <CreateServiceForm />
      <ServicesTableView registry={registry} />
    </div>
  );
}
