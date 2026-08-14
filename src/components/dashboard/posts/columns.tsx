"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import type { MetricKey } from "@/lib/metric-definitions";
import type { ClientPostRow } from "@/services/types";

const HEAD = "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase";
const NUM = "font-mono text-sm tabular-nums";

/** Column meta: layout class plus the word the sort button speaks. */
export interface PostColumnMeta {
  className?: string;
  sortLabel?: string;
  /**
   * The `metric-definitions.ts` key for an ⓘ beside this column's header.
   *
   * ⚠️ DECLARED HERE, RENDERED IN `posts-table.tsx`, AND IT HAS TO BE. A
   * sortable column's `header` output is placed INSIDE the sort `<button>`, so
   * an ⓘ returned from `header` would be a button nested in a button — invalid
   * markup, and unreachable by keyboard. The table renders it as a SIBLING of
   * the sort control instead.
   */
  /**
   * ⚠️ `MetricKey`, NOT `string` — these are AUTHORED LITERALS, so a typo must be
   * a compile error. `MetricInfo`'s own prop stays `string` on purpose: it also
   * receives RUNTIME labels, and its unmapped branch (render nothing rather than
   * guess) is load-bearing and separately tested. Tightening it there would
   * delete that branch; tightening it here only catches the mistake nobody
   * would otherwise see, because an unknown key renders silently.
   */
  infoMetric?: MetricKey;
}

/**
 * The em dash for a value that is NOT KNOWN.
 *
 * ⚠️ NEVER render this for a zero. A `0` is a measured fact ("it was reported,
 * and it was none"); this is the absence of one. The screen-reader text spells
 * the difference out, because the glyph alone is indistinguishable from an
 * empty cell — this repo has collapsed the two twice.
 */
function Unknown({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{what} not reported</span>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // UTC throughout: the BI view's dates are UTC, and rendering them in the
  // viewer's zone would shift a post across a period boundary the report
  // already placed it on the other side of.
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A right-aligned metric that is always a number — 0 included, and meant. */
function metric(
  id: keyof Pick<ClientPostRow, "impressions" | "likes" | "comments" | "shares" | "interactions">,
  header: string,
): ColumnDef<ClientPostRow> {
  return {
    accessorKey: id,
    header: () => <span className={`${HEAD} block text-right`}>{header}</span>,
    meta: { className: "text-right", sortLabel: header.toLowerCase() } satisfies PostColumnMeta,
    cell: ({ row }) => <span className={NUM}>{row.original[id].toLocaleString()}</span>,
  };
}

export const columns: ColumnDef<ClientPostRow>[] = [
  {
    id: "date",
    // `undefined` (NOT null) for an unplaceable post: `sortUndefined: "last"` is
    // applied before the ascending/descending inversion, so those rows park at
    // the bottom in BOTH directions. A null would sort as a value — at epoch 0,
    // which would claim these are the oldest posts the client has.
    accessorFn: (post) => post.sortMs ?? undefined,
    sortUndefined: "last",
    header: () => <span className={HEAD}>Date</span>,
    meta: { className: "w-[15%] whitespace-nowrap", sortLabel: "date" } satisfies PostColumnMeta,
    cell: ({ row }) => {
      const { date, age } = row.original;
      if (date) {
        return <span className="font-mono text-xs text-muted-foreground">{formatDate(date)}</span>;
      }
      // ⚠️ NO RESOLVED DATE. The scrape reported a relative age in hours and the
      // publish date was never resolved, so we show the age AS SCRAPED and mark
      // it approximate. `scraped_at` is the windowing key and is never shown
      // here — the date a post was scraped is not the date it was published.
      if (age) {
        return (
          <span className="font-mono text-xs text-muted-foreground">
            <span aria-hidden>≈ </span>
            {age}
            <span className="sr-only"> — approximate age; publish date not resolved</span>
          </span>
        );
      }
      return (
        <span className="font-mono text-xs text-muted-foreground">
          <Unknown what="Publish date" />
        </span>
      );
    },
  },
  {
    id: "post",
    accessorFn: (post) => post.snippet,
    enableSorting: false,
    header: () => <span className={HEAD}>Post</span>,
    // ⚠️ `w-full max-w-0` IS LOAD-BEARING, NOT DECORATION. This is the ONLY
    // flexible column, so `w-full` makes it claim the width the fixed columns
    // leave, and `max-w-0` stops a long snippet from widening the cell past that
    // — which is what lets the inner `truncate` clip. With `max-w-0` alone (no
    // `w-full`) the cell collapsed to a single character and its header ran into
    // "Asset type".
    meta: { className: "w-full max-w-0" } satisfies PostColumnMeta,
    // The snippet is a PREVIEW, not the link — the Link column beside it owns the
    // pressable link, so the post text is never itself an anchor.
    cell: ({ row }) => (
      <span className="block truncate text-sm">
        {row.original.snippet || <span className="text-muted-foreground/60">No text content</span>}
      </span>
    ),
  },
  {
    id: "link",
    enableSorting: false,
    header: () => <span className={HEAD}>Link</span>,
    meta: { className: "w-px whitespace-nowrap text-center" } satisfies PostColumnMeta,
    // The post's own URL, carried from the upload straight through the seam. An
    // icon rather than text keeps the column tight; `aria-label` gives the icon a
    // name for assistive tech.
    //
    // ⚠️ NEVER a dead link. A post with no URL renders the same "not reported"
    // treatment every other missing value gets — not an anchor pointing nowhere.
    cell: ({ row }) => {
      const { url } = row.original;
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open post on LinkedIn"
          className="inline-flex text-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">
          <Unknown what="Post link" />
        </span>
      );
    },
  },
  {
    id: "format",
    accessorFn: (post) => post.formatLabel,
    header: () => <span className={HEAD}>Asset type</span>,
    meta: { className: "w-[12%]", sortLabel: "asset type" } satisfies PostColumnMeta,
    // The HUMAN label, never the raw scraper token. "Unknown" is a real member
    // of the vocabulary — a post with no attribute record, not an error.
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.formatLabel}</span>
    ),
  },
  metric("impressions", "Impressions"),
  metric("likes", "Likes"),
  metric("comments", "Comments"),
  metric("shares", "Shares"),
  {
    id: "saves",
    // Same `undefined` trick as the date column: an unreported metric parks at
    // the bottom in both sort directions rather than sorting as a zero.
    accessorFn: (post) => post.saves ?? undefined,
    sortUndefined: "last",
    header: () => <span className={`${HEAD} block text-right`}>Saves</span>,
    meta: { className: "text-right", sortLabel: "saves" } satisfies PostColumnMeta,
    cell: ({ row }) => (
      <span className={NUM}>
        {row.original.saves === null ? (
          <Unknown what="Saves" />
        ) : (
          row.original.saves.toLocaleString()
        )}
      </span>
    ),
  },
  metric("interactions", "Interactions"),
  {
    id: "engagementRate",
    // Same `undefined` treatment as the date and saves columns: a rate the view
    // does not carry parks at the bottom in BOTH sort directions rather than
    // sorting as a 0%, which would rank it as the worst-performing post.
    accessorFn: (post) => post.engagementRate ?? undefined,
    sortUndefined: "last",
    header: () => <span className={`${HEAD} block text-right`}>Engagement rate</span>,
    meta: {
      className: "text-right whitespace-nowrap",
      sortLabel: "engagement rate",
      // ⚠️ `engagementRatePerPost`, and the distinction is the whole point. The
      // dashboard prints "Engagement rate" too, over a DIFFERENT statistic — a
      // ratio of the window's totals. Wiring only that side would have left a
      // reader holding two screens that disagree under one word, with a tooltip
      // on one of them confirming the wrong reading.
      infoMetric: "engagementRatePerPost",
    } satisfies PostColumnMeta,
    cell: ({ row }) => (
      <span className={NUM}>
        {row.original.engagementRate === null ? (
          // ⚠️ NEVER a computed stand-in. ArcBase could derive a rate from
          // interactions and impressions, and deliberately does not — a figure
          // the view did not publish is not a figure this table may invent.
          <Unknown what="Engagement rate" />
        ) : (
          `${row.original.engagementRate.toFixed(1)}%`
        )}
      </span>
    ),
  },
];
