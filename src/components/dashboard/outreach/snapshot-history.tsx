"use client";

import * as React from "react";
import { CloudOff, RotateCcw } from "lucide-react";

import {
  unvoidSnapshotAction,
  voidSnapshotAction,
  type VoidActionResult,
} from "@/app/(app)/clients/[id]/outreach/void-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Attribution } from "@/lib/outreach-attribution";

// ─────────────────────────────────────────────────────────────────────────────
// THE SNAPSHOT HISTORY — every upload for this Client, live and voided alike.
//
// ⚠️ VOIDED ROWS ARE SHOWN, NOT HIDDEN. A reversible flag nobody can see is not
// reversible, and a hidden voided row is indistinguishable from one that never
// existed. `listOutreachUploads` returns them for exactly this reason.
//
// ⚠️ `canVoid` IS AFFORDANCE. It is computed on the server from the same
// comparison the RPC makes, and it decides what to SHOW. It is not sent to the
// action and would be worthless if it were — the SECURITY DEFINER function
// refuses on its own authority. See `lib/outreach-attribution.ts`.
//
// ⚠️ A ROW WITH NO CONTROL IS RENDERED WITH NO CONTROL — not with a disabled one.
// A greyed-out button invites hovering and wondering; its absence says the same
// thing without the invitation, and a control that would raise 42501 on every
// press teaches staff that the app is broken rather than that the row is not
// theirs.
// ─────────────────────────────────────────────────────────────────────────────

/** One row of the history, with its permission already decided server-side. */
export interface SnapshotHistoryRow {
  id: string;
  createdAt: string;
  rowCount: number;
  uploadedBy: Attribution;
  /** The timestamp, or `null` for a LIVE snapshot. No boolean twin. */
  voidedAt: string | null;
  voidedBy: Attribution;
  canVoid: boolean;
}

/**
 * ⚠️ THREE SENTENCES, BECAUSE THERE ARE THREE ANSWERS. "Not recorded" is not a
 * politer way of saying "Another user" — it says no uuid was stored at all,
 * which is what happens when a row is written outside a user session.
 */
const ATTRIBUTION_LABEL: Record<Attribution, string> = {
  you: "You",
  another: "Another user",
  unrecorded: "Not recorded",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SnapshotHistory({
  rows,
  clientName,
}: {
  /** `null` means the history could not be read IN FULL — see below. */
  rows: SnapshotHistoryRow[] | null;
  clientName: string;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<SnapshotHistoryRow | null>(null);

  async function submit(row: SnapshotHistoryRow, direction: "void" | "unvoid") {
    setPending(row.id);
    setError(null);
    const result: VoidActionResult =
      direction === "void" ? await voidSnapshotAction(row.id) : await unvoidSnapshotAction(row.id);
    setPending(null);
    setConfirming(null);
    // ⚠️ A REFUSAL IS SHOWN, NEVER SWALLOWED. The list is revalidated by the
    // action on success only, so a silent failure would leave the old rows on
    // screen with nothing to explain why nothing moved.
    if (result.status === "error") setError(result.message);
  }

  // ⚠️ `null` MEANS TRUNCATED **OR** FAILED — `listOutreachUploads` nulls both,
  // because a partial upload history has no honest rendering. It must never draw
  // as an empty history ("this Client has no snapshots") nor as a complete one
  // missing its oldest rows.
  if (rows === null) {
    return (
      <section className="space-y-4">
        <HistoryHeading />
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
          <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">Snapshot history unavailable</p>
            <p className="mt-0.5 text-muted-foreground">
              ArcBase could not read this client&rsquo;s upload history in full, so none of it is
              shown — a partial history would misstate when their outreach began. This is not a
              claim that there are no snapshots.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="space-y-4">
        <HistoryHeading />
        <p className="rounded-lg border px-4 py-3 font-mono text-xs text-muted-foreground">
          No snapshots have been uploaded for this client.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <HistoryHeading />

      {error ? (
        <p role="alert" className="rounded-lg border border-dashed px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <ul className="divide-y rounded-lg border">
        {rows.map((row) => {
          const voided = row.voidedAt !== null;
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs">
                  {formatWhen(row.createdAt)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {row.rowCount.toLocaleString("en-US")} rows
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  Uploaded by {ATTRIBUTION_LABEL[row.uploadedBy]}
                  {voided ? <> · Voided by {ATTRIBUTION_LABEL[row.voidedBy]}</> : null}
                </p>
              </div>

              <span
                className={
                  voided
                    ? "font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
                    : "font-mono text-[10px] tracking-widest text-primary uppercase"
                }
              >
                {voided ? "Voided" : "Live"}
              </span>

              {/* ⚠️ EXACTLY ONE CONTROL, NEVER BOTH — a row is live or voided, so
                  offering both would be offering one that cannot apply. And no
                  control at all where `canVoid` is false. */}
              {row.canVoid ? (
                voided ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending === row.id}
                    onClick={() => submit(row, "unvoid")}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Un-void
                  </Button>
                ) : (
                  // ⚠️ CONFIRMED, BECAUSE VOIDING IS THE DESTRUCTIVE DIRECTION.
                  // Un-void needs none: it restores a record nothing destroyed.
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending === row.id}
                    onClick={() => setConfirming(row)}
                  >
                    Void
                  </Button>
                )
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* ⚠️ A shadcn Dialog, NEVER `window.confirm`. A native dialog blocks the
          event loop and this repo's browser automation outright. */}
      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this snapshot?</DialogTitle>
            {/* ⚠️ CLIENT NAME, ROW COUNT AND DATE — ALL THREE. The mistake being
                corrected is usually MIS-ATTRIBUTION, so the dialog's job is to
                let someone notice "wrong Client" BEFORE they confirm rather than
                after. A bare "Are you sure?" cannot do that. */}
            <DialogDescription>
              {confirming ? (
                <>
                  <strong className="text-foreground">{clientName}</strong> —{" "}
                  {confirming.rowCount.toLocaleString("en-US")} rows, uploaded{" "}
                  {formatWhen(confirming.createdAt)}.
                  <br />
                  It will stop counting towards this client&rsquo;s figures and disappear from their
                  report. Nothing is deleted, and you can un-void it here afterwards.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={confirming !== null && pending === confirming.id}
              onClick={() => confirming && submit(confirming, "void")}
            >
              Void snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function HistoryHeading() {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Snapshot history
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Every upload for this client. Voiding stops a snapshot counting without deleting it.
      </p>
    </div>
  );
}
