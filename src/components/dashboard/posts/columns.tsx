"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { ClientPostRow } from "@/services/types";

const HEAD = "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase";
const NUM = "font-mono text-sm tabular-nums";

/** Column meta: layout class plus the word the sort button speaks. */
export interface PostColumnMeta {
  className?: string;
  sortLabel?: string;
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
    meta: { className: "max-w-0" } satisfies PostColumnMeta,
    cell: ({ row }) => {
      const { url, snippet } = row.original;
      const text = snippet || <span className="text-muted-foreground/60">No text content</span>;
      // A missing url renders as PLAIN TEXT, never as an anchor with nowhere to
      // go. There is no dead link anywhere in this table.
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm underline-offset-4 hover:underline"
        >
          {text}
        </a>
      ) : (
        <span className="block truncate text-sm">{text}</span>
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
];
