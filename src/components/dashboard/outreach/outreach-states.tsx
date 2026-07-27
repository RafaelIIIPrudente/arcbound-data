import Link from "next/link";
import { CloudOff, Inbox, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paths } from "@/paths";

// ─────────────────────────────────────────────────────────────────────────────
// THE THREE READ STATES OF AN OUTREACH SNAPSHOT, WORDED APART ON PURPOSE.
//
// `latestSnapshot` returns three outcomes and they license three different
// sentences:
//
//   unavailable  — the read broke. Figures are meaningless; the page shows none.
//   empty        — the read worked; this Client has never had an upload. The ONLY
//                  state that may render as an empty dashboard.
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
