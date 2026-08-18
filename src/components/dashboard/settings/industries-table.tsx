"use client";

import { useActionState, useId, useState } from "react";

import {
  createIndustryAction,
  deleteIndustryAction,
  renameIndustryAction,
  setIndustryStatusAction,
  type IndustryActionState,
} from "@/app/(app)/settings/industries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Industry } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The industries registry. Admin-only — the page calls `requireAdmin()` before
// this renders.
//
// ⚠️ FOUR SITUATIONS THAT WOULD LOOK IDENTICAL IF LET. An empty registry, a
// failed read, a refused delete and an archived row are four different facts,
// and each has a different thing to do about it. Collapsing any pair is cheap —
// one `rows.length === 0` and the first two become the same sentence.
//
// ⚠️ FRICTION IS SCALED TO BLAST RADIUS, AND SPENT RATHER THAN SPRINKLED. A
// confirmation on every control teaches people to click through confirmations,
// costing exactly the protection it was meant to buy. So:
//   • Rename — no confirmation. Clients point at an industry by FOREIGN KEY, so
//     a rename moves every label at once and re-attributes nobody.
//   • Archive / Restore — no confirmation. Reversible, and it evicts no Client.
//   • Delete — a second, named click. It cannot be undone.
//
// ⚠️ NO DATABASE INVARIANT IS RE-DERIVED IN THIS FILE. Nothing here decides in
// advance whether a delete will be refused: `delete_industry` owns that rule and
// answers with a count, and this component's job is to repeat that answer.
//
// ⚠️ THIS FILE HAS A TWIN: `writers-table.tsx`. The two registries have the same
// shape — id, name, status, four admin RPCs — and the same rules, so a change to
// one of them is almost always a change to both. THEY ARE DELIBERATELY NOT
// SHARED: the executable half is ~46 lines and a factory over TWO instances
// would add more indirection than it removes, while the half that differs is the
// prose, which is exactly the half worth keeping per-registry.
//
// (`arcbound-services.ts` is NOT a third instance of this shape — it carries a
// slug, a handler, a sort order, per-client assignments and a `can_delete` flag,
// and shares no function name with this file.)
//
// So: if you change what a registry read, refusal or archive MEANS here, open
// the twin. Nothing but this comment will remind you.
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: IndustryActionState = { status: "idle" };

interface RowViewProps {
  industry: Industry;
  state: IndustryActionState;
  renameAction: (formData: FormData) => void;
  statusAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
  pending: boolean;
}

/** Pure(ish) render of one registry row — testable without firing server actions. */
export function IndustryRowView({
  industry,
  state,
  renameAction,
  statusAction,
  deleteAction,
  pending,
}: RowViewProps) {
  const [confirming, setConfirming] = useState(false);
  const panelId = useId();
  const renameId = useId();

  const archived = industry.status === "archived";

  return (
    <div className="space-y-3 border-b px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {industry.name}
            {archived ? (
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Archived
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {archived
              ? // ⚠️ SAYS WHAT ARCHIVING DID AND DID NOT DO. Archived is not
                // deleted: the Clients recorded here still read this industry,
                // because the client read follows the foreign key rather than
                // the status. Without this line "Archived" is indistinguishable
                // from "gone", and an admin would go looking for lost data.
                "Retired — not offered for new clients. Clients already in it still show it."
              : "Offered when recording a client's industry."}
          </p>

          {state.status === "error" ? (
            // ⚠️ THE DATABASE'S OWN WORDS, INCLUDING ITS COUNT. `delete_industry`
            // says "cannot delete: 3 client(s) are still recorded in this
            // industry". Three clients is a morning's work and thirty is a
            // decision; a generic "Cannot delete" tells an admin neither.
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
          <form action={renameAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={industry.id} />
            <label htmlFor={renameId} className="sr-only">
              Rename {industry.name}
            </label>
            {/* Uncontrolled, carrying the current name: the field is a starting
                point to edit, not state React has to own. */}
            <Input
              id={renameId}
              name="name"
              defaultValue={industry.name}
              autoComplete="off"
              className="h-9 w-40"
            />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              Rename
            </Button>
          </form>

          <form action={statusAction}>
            <input type="hidden" name="id" value={industry.id} />
            <input type="hidden" name="status" value={archived ? "active" : "archived"} />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              {archived ? "Restore" : "Archive"}
            </Button>
          </form>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={pending}
            aria-expanded={confirming}
            aria-controls={panelId}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* ⚠️ THE TWO CONTROLS SAY WHAT THEY COST, IN WORDS, NEXT TO THEMSELVES.
          Archive and Delete are one keystroke apart and their consequences are
          not comparable; a reader who has to remember which is which will
          eventually remember wrong. */}
      <p className="text-xs text-muted-foreground">
        Archiving retires an industry and can be restored later. Deleting is permanent — and the
        database refuses it while any client is still recorded in this industry.
      </p>

      {confirming ? (
        <div
          id={panelId}
          role="group"
          aria-label={`Delete ${industry.name}`}
          className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
          <p className="text-sm">
            Delete <strong>{industry.name}</strong> permanently? This cannot be undone. If any
            client is recorded in it the database will refuse and tell you how many — archive it
            instead to retire it reversibly.
          </p>
          <div className="flex items-center gap-2">
            <form action={deleteAction}>
              <input type="hidden" name="id" value={industry.id} />
              <Button type="submit" variant="destructive" size="sm" disabled={pending}>
                Delete {industry.name}
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
function IndustryRow({ industry }: { industry: Industry }) {
  const [renameState, renameAction, renamePending] = useActionState(renameIndustryAction, IDLE);
  const [statusState, statusAction, statusPending] = useActionState(setIndustryStatusAction, IDLE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteIndustryAction, IDLE);

  // Whichever of the three last said something is what this row reports. Delete
  // wins ties because its refusal is the one carrying information.
  const state =
    deleteState.status !== "idle"
      ? deleteState
      : statusState.status !== "idle"
        ? statusState
        : renameState;

  return (
    <IndustryRowView
      industry={industry}
      state={state}
      renameAction={renameAction}
      statusAction={statusAction}
      deleteAction={deleteAction}
      pending={renamePending || statusPending || deletePending}
    />
  );
}

interface CreateViewProps {
  state: IndustryActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

/** Add an industry. */
export function CreateIndustryFormView({ state, formAction, pending }: CreateViewProps) {
  // `useId()` like `IndustryRowView`, rather than a hardcoded string: this form
  // is a component, and two of it on one page would otherwise share one label.
  const nameId = useId();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Add an industry
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor={nameId} className="sr-only">
            Industry name
          </label>
          <Input id={nameId} name="name" placeholder="SaaS" autoComplete="off" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add industry"}
        </Button>
      </div>

      {/* Names are unique case-insensitively in the database — "SaaS" and "saas"
          cannot both exist. Saying so here is cheaper than a constraint error. */}
      <p className="text-xs text-muted-foreground">
        One name per industry — capitalisation is ignored when checking for duplicates.
      </p>

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

function CreateIndustryForm() {
  const [state, formAction, pending] = useActionState(createIndustryAction, IDLE);
  return <CreateIndustryFormView state={state} formAction={formAction} pending={pending} />;
}

/**
 * The registry read.
 *
 * ⚠️ `unavailable` IS ITS OWN STATE, NOT AN EMPTY LIST. An empty registry is a
 * true statement about Arcbound — nothing is recorded yet, which is exactly the
 * state today. A failed read is a statement about ArcBase: we do not know.
 * Collapsing them tells an admin the registry is empty at the moment it might be
 * full and unreachable, and the fix for each is different.
 */
export type IndustriesRegistry =
  { status: "ok"; industries: Industry[] } | { status: "unavailable" };

export function IndustriesTableView({ registry }: { registry: IndustriesRegistry }) {
  if (registry.status === "unavailable") {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
      >
        The industries registry could not be read. This is not the same as it being empty — do not
        add industries until it loads, or you may create duplicates.
      </p>
    );
  }

  if (registry.industries.length === 0) {
    // ⚠️ AN INVITATION, NOT A FAULT — and this is what production looks like
    // right now. The registry ships empty by decision: which industries Arcbound
    // recognises is still open, and a guessed list would be indistinguishable
    // from a decision once it was in the table. So the very first thing anyone
    // sees on this screen is this sentence, and it must not read like a bug.
    return (
      <p role="status" className="text-sm text-muted-foreground">
        None yet — add the first industry above. Clients can be recorded in one as soon as it is
        here.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {registry.industries.map((industry) => (
        <IndustryRow key={industry.id} industry={industry} />
      ))}
    </div>
  );
}

/**
 * The whole screen body: the add form, then the registry.
 *
 * ⚠️ NO ADD FORM WHILE THE REGISTRY IS UNREADABLE. The alert below says "do not
 * add industries until it loads, or you may create duplicates" — and a live form
 * sitting above that sentence turns the warning into a caption on a trap. The
 * advice is right; withdrawing the control is what makes it more than advice.
 * Names are unique case-insensitively, so the duplicate it warns about does not
 * even succeed: it comes back as a constraint error for following the screen.
 */
export function IndustriesTable({ registry }: { registry: IndustriesRegistry }) {
  return (
    <div className="space-y-4">
      {registry.status === "ok" ? <CreateIndustryForm /> : null}
      <IndustriesTableView registry={registry} />
    </div>
  );
}
