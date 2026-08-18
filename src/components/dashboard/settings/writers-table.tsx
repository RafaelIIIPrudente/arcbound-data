"use client";

import { useActionState, useId, useState } from "react";

import {
  createWriterAction,
  deleteWriterAction,
  renameWriterAction,
  setWriterStatusAction,
  type WriterActionState,
} from "@/app/(app)/settings/writers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Writer } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The writers registry. Admin-only — the page calls `requireAdmin()` before
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
//   • Rename — no confirmation. Clients point at a writer by FOREIGN KEY, so
//     a rename moves every label at once and re-attributes nobody.
//   • Archive / Restore — no confirmation. Reversible, and it evicts no Client.
//   • Delete — a second, named click. It cannot be undone.
//
// ⚠️ NO DATABASE INVARIANT IS RE-DERIVED IN THIS FILE. Nothing here decides in
// advance whether a delete will be refused: `delete_writer` owns that rule and
// answers with a count, and this component's job is to repeat that answer.
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: WriterActionState = { status: "idle" };

interface RowViewProps {
  writer: Writer;
  state: WriterActionState;
  renameAction: (formData: FormData) => void;
  statusAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
  pending: boolean;
}

/** Pure(ish) render of one registry row — testable without firing server actions. */
export function WriterRowView({
  writer,
  state,
  renameAction,
  statusAction,
  deleteAction,
  pending,
}: RowViewProps) {
  const [confirming, setConfirming] = useState(false);
  const panelId = useId();
  const renameId = useId();

  const archived = writer.status === "archived";

  return (
    <div className="space-y-3 border-b px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {writer.name}
            {archived ? (
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Archived
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {archived
              ? // ⚠️ SAYS WHAT ARCHIVING DID AND DID NOT DO. Archived is not
                // deleted: the Clients recorded here still read this writer,
                // because the client read follows the foreign key rather than
                // the status. Without this line "Archived" is indistinguishable
                // from "gone", and an admin would go looking for lost data.
                "Retired — not offered for new clients. Clients already recorded against them keep it."
              : "Offered when recording a client's writer."}
          </p>

          {state.status === "error" ? (
            // ⚠️ THE DATABASE'S OWN WORDS, INCLUDING ITS COUNT. `delete_writer`
            // says "cannot delete: 3 client(s) are still recorded in this
            // writer". Three clients is a morning's work and thirty is a
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
            <input type="hidden" name="id" value={writer.id} />
            <label htmlFor={renameId} className="sr-only">
              Rename {writer.name}
            </label>
            {/* Uncontrolled, carrying the current name: the field is a starting
                point to edit, not state React has to own. */}
            <Input
              id={renameId}
              name="name"
              defaultValue={writer.name}
              autoComplete="off"
              className="h-9 w-40"
            />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              Rename
            </Button>
          </form>

          <form action={statusAction}>
            <input type="hidden" name="id" value={writer.id} />
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
        Archiving retires a writer and can be restored later. Deleting is permanent — and the
        database refuses it while any client is still recorded against this writer.
      </p>

      {confirming ? (
        <div
          id={panelId}
          role="group"
          aria-label={`Delete ${writer.name}`}
          className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
          <p className="text-sm">
            Delete <strong>{writer.name}</strong> permanently? This cannot be undone. If any client
            is recorded against them the database will refuse and tell you how many — archive it
            instead to retire it reversibly.
          </p>
          <div className="flex items-center gap-2">
            <form action={deleteAction}>
              <input type="hidden" name="id" value={writer.id} />
              <Button type="submit" variant="destructive" size="sm" disabled={pending}>
                Delete {writer.name}
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
function WriterRow({ writer }: { writer: Writer }) {
  const [renameState, renameAction, renamePending] = useActionState(renameWriterAction, IDLE);
  const [statusState, statusAction, statusPending] = useActionState(setWriterStatusAction, IDLE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteWriterAction, IDLE);

  // Whichever of the three last said something is what this row reports. Delete
  // wins ties because its refusal is the one carrying information.
  const state =
    deleteState.status !== "idle"
      ? deleteState
      : statusState.status !== "idle"
        ? statusState
        : renameState;

  return (
    <WriterRowView
      writer={writer}
      state={state}
      renameAction={renameAction}
      statusAction={statusAction}
      deleteAction={deleteAction}
      pending={renamePending || statusPending || deletePending}
    />
  );
}

interface CreateViewProps {
  state: WriterActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

/** Add a writer. */
export function CreateWriterFormView({ state, formAction, pending }: CreateViewProps) {
  // `useId()` like `WriterRowView`, rather than a hardcoded string: this form
  // is a component, and two of it on one page would otherwise share one label.
  const nameId = useId();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Add a writer
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor={nameId} className="sr-only">
            Writer name
          </label>
          <Input id={nameId} name="name" placeholder="Ryan Prior" autoComplete="off" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add writer"}
        </Button>
      </div>

      {/* ⚠️ NAMES ARE UNIQUE CASE-INSENSITIVELY, AND PEOPLE COLLIDE WHERE
          INDUSTRIES DO NOT. There is one "Tech"; there can genuinely be two
          people called Ryan Prior, and the second will be refused. That refusal
          is right — a registry whose entries cannot be told apart puts an
          unanswerable question on every screen that shows a writer — and the
          answer is a distinguishable name, never a second identical row. Saying
          so here is cheaper than a constraint error. */}
      <p className="text-xs text-muted-foreground">
        One entry per writer, and capitalisation is ignored when checking for duplicates. If two
        people share a name, give one of them something to tell them apart.
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

function CreateWriterForm() {
  const [state, formAction, pending] = useActionState(createWriterAction, IDLE);
  return <CreateWriterFormView state={state} formAction={formAction} pending={pending} />;
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
export type WritersRegistry = { status: "ok"; writers: Writer[] } | { status: "unavailable" };

export function WritersTableView({ registry }: { registry: WritersRegistry }) {
  if (registry.status === "unavailable") {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
      >
        The writers registry could not be read. This is not the same as it being empty — do not add
        writers until it loads, or you may create duplicates.
      </p>
    );
  }

  if (registry.writers.length === 0) {
    // ⚠️ AN INVITATION, NOT A FAULT — and this is what production looks like
    // right now. The registry ships empty by decision: which writers Arcbound
    // recognises is still open, and a guessed list would be indistinguishable
    // from a decision once it was in the table. So the very first thing anyone
    // sees on this screen is this sentence, and it must not read like a bug.
    return (
      <p role="status" className="text-sm text-muted-foreground">
        None yet — add the first writer above. Clients can be recorded against one as soon as it is
        here.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {registry.writers.map((writer) => (
        <WriterRow key={writer.id} writer={writer} />
      ))}
    </div>
  );
}

/**
 * The whole screen body: the add form, then the registry.
 *
 * ⚠️ NO ADD FORM WHILE THE REGISTRY IS UNREADABLE. The alert below says "do not
 * add writers until it loads, or you may create duplicates" — and a live form
 * sitting above that sentence turns the warning into a caption on a trap. The
 * advice is right; withdrawing the control is what makes it more than advice.
 * Names are unique case-insensitively, so the duplicate it warns about does not
 * even succeed: it comes back as a constraint error for following the screen.
 */
export function WritersTable({ registry }: { registry: WritersRegistry }) {
  return (
    <div className="space-y-4">
      {registry.status === "ok" ? <CreateWriterForm /> : null}
      <WritersTableView registry={registry} />
    </div>
  );
}
