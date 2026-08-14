import Link from "next/link";
import { Ban, CloudOff, Inbox, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paths } from "@/paths";

// ─────────────────────────────────────────────────────────────────────────────
// THE READ STATES OF AN OUTREACH SNAPSHOT, WORDED APART ON PURPOSE.
//
// `latestSnapshot` returns four outcomes and they license four different
// sentences:
//
//   unavailable  — the read broke. Figures are meaningless; the page shows none.
//   empty        — the read worked; this Client has never had an upload.
//   all-voided   — the read worked; they HAVE uploaded, and every snapshot was
//                  voided. ⚠️ NOT `empty`. "Nothing has been uploaded for this
//                  client" is FALSE here, and false in the direction that
//                  invites re-uploading data that is already recorded.
//   truncated    — the read worked but stopped at the pager's cap. Figures are
//                  REAL BUT INCOMPLETE, so they still render, beneath a banner,
//                  and every one of them is a LOWER BOUND.
//
// ⚠️ A READER SHOWN THE WRONG ONE EITHER DISTRUSTS GOOD NUMBERS OR TRUSTS SHORT
// ONES. The worst collapse — a failed read rendering as "0 prospects" — is the
// one this file exists to make impossible, and a test asserts that the
// unavailable panel contains no zero at all.
//
// These mirror `analytics-unavailable.tsx` rather than importing it: that
// component's copy counts POSTS and speaks of a range, neither of which is true
// of a prospect snapshot.
// ─────────────────────────────────────────────────────────────────────────────

/** The read FAILED. We know nothing — so we claim nothing. */
export function OutreachUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 py-20 text-center">
      <CloudOff className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">Outreach unavailable</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {/* ⚠️ NOT "no prospects", AND NO FIGURE OF ANY KIND. This panel replaces
              the dashboard precisely because there is nothing true to put in it. */}
          We couldn&rsquo;t read this client&rsquo;s outreach snapshot right now. This usually
          clears once access is restored — try again shortly.
        </p>
      </div>
    </div>
  );
}

/** The read SUCCEEDED and found nothing. A real answer, not a failure. */
export function OutreachNoSnapshot() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border py-20 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">No outreach snapshot yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Nothing has been uploaded for this client. Add the Master Database CSV on the Outreach
          System tab of Add Data and the pipeline appears here.
        </p>
      </div>
      <Button asChild>
        <Link href={paths.upload}>Go to Add Data</Link>
      </Button>
    </div>
  );
}

/**
 * The read SUCCEEDED, this Client HAS uploaded, and every snapshot is voided.
 *
 * ⚠️ ITS OWN PANEL BECAUSE ITS SENTENCE IS THE OPPOSITE OF `OutreachNoSnapshot`'s.
 * That one says "nothing has been uploaded" and offers Add Data; said to a
 * Client whose colleague voided their upload an hour ago it is false, and it
 * invites re-uploading data ArcBase already holds. This one says the data exists
 * and is voided.
 *
 * ⚠️ NO "GO TO ADD DATA" BUTTON, DELIBERATELY. Uploading again is the wrong
 * remedy here — the right one is un-voiding, and that control does not exist
 * yet (S3). A CTA pointing at the wrong fix is worse than no CTA; a CTA
 * pointing at a screen that does not exist is worse still.
 *
 * ⚠️ STAFF VOCABULARY IS CORRECT HERE. This is an internal surface, "voided" and
 * "upload" are the words staff use, and hedging them would obscure which action
 * is needed.
 */
export function OutreachAllVoided({ voidedCount }: { voidedCount: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
      <Ban className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">Every snapshot voided</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {/* ⚠️ A NULL COUNT PRINTS NO FIGURE — never 0. `voidedCount` is null
              only when the database declined to report an exact count, and a 0
              would contradict the state itself: this panel exists precisely
              because at least one voided snapshot is there. */}
          {voidedCount === null ? (
            <>This client&rsquo;s outreach snapshots have all been voided</>
          ) : (
            <>
              All {voidedCount.toLocaleString("en-US")} of this client&rsquo;s outreach snapshot
              {voidedCount === 1 ? " has" : "s have"} been voided
            </>
          )}
          , so there is no current snapshot to show. This is not the same as never having uploaded —
          the data is still recorded, and voiding can be reversed.
        </p>
      </div>
    </div>
  );
}

/**
 * The read SUCCEEDED but hit the pager's cap.
 *
 * ⚠️ A BANNER, NOT A PANEL — because the figures underneath are still worth
 * reading. It sits above them and says they are floors, not totals.
 */
export function OutreachTruncated({ read, total }: { read: number; total: number | null }) {
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
      <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="text-sm">
        <p className="font-medium">Showing part of this snapshot</p>
        <p className="mt-0.5 text-muted-foreground">
          {/* ⚠️ BOTH NUMBERS, ALWAYS. "Part of this snapshot" cannot tell a reader
              whether they are missing one prospect or eighty thousand — and the
              pager has known the exact total all along. `null` means the total is
              genuinely unknown, which is said plainly rather than shown as 0. */}
          {total === null ? (
            <>
              ArcBase read the first {n(read)} prospects in this snapshot and could not establish
              how many more there are.
            </>
          ) : (
            <>
              ArcBase read {n(read)} of {n(total)} prospects in this snapshot.
            </>
          )}{" "}
          Every figure below counts only the prospects it read, so treat them as lower bounds, not
          totals.
        </p>
      </div>
    </div>
  );
}
