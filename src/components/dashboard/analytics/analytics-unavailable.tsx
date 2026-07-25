import { CloudOff, Layers } from "lucide-react";

/**
 * Shown when the analytics source can't be read (e.g. the BI views aren't yet
 * reachable) — deliberately distinct from the "No posts yet" empty state, and
 * carrying no raw error/dev detail.
 */
export function AnalyticsUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 py-20 text-center">
      <CloudOff className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">Analytics unavailable</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          We couldn&rsquo;t load analytics right now. This usually clears once access is restored —
          try again shortly.
        </p>
      </div>
    </div>
  );
}

/**
 * Shown when the read SUCCEEDED but hit the pager's cap.
 *
 * ⚠️ A DIFFERENT FACT FROM `AnalyticsUnavailable`, DELIBERATELY WORDED APART.
 * Unavailable means the figures are meaningless and the page shows nothing else;
 * this means they are REAL BUT INCOMPLETE, so the charts and KPIs still render
 * beneath it and every one of them is a LOWER BOUND. A reader shown the wrong
 * one of these will either distrust good numbers or trust short ones.
 *
 * A banner rather than a panel, for exactly that reason: it sits above figures
 * that are still worth reading.
 */
export function AnalyticsTruncated({ read, total }: { read: number; total: number | null }) {
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
      <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="text-sm">
        <p className="font-medium">Showing part of this range</p>
        <p className="mt-0.5 text-muted-foreground">
          {/* ⚠️ THE TWO NUMBERS ARE THE POINT. "Part of this range" alone cannot
              tell a reader whether they are missing 1 post or 87,412 of them —
              and the pager has known the exact total all along. */}
          {total === null ? (
            <>
              ArcBase read the first {n(read)} posts in this range and could not establish how many
              more there are.
            </>
          ) : (
            <>
              ArcBase read {n(read)} of {n(total)} posts in this range.
            </>
          )}{" "}
          Every figure below counts only the posts it read, so treat them as lower bounds, not
          totals.
        </p>
      </div>
    </div>
  );
}
