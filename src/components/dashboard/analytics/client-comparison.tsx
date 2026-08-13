"use client";

import * as React from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { MetricInfo } from "@/components/dashboard/metric-info";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { metricDefinition } from "@/lib/metric-definitions";
import { cn } from "@/lib/utils";
import { paths } from "@/paths";
import type { ClientComparison, ClientComparisonRow, ComparisonMedian } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Every Client side by side over the Dashboard's selected range.
//
// ⚠️ A COMPARISON'S INTEGRITY LIVES IN ITS DENOMINATORS. Every column but
// `posts` is a normalised figure, so a Client with no posts, no impressions or
// no recorded followers must read as "not applicable" — a 0 would rank them
// bottom of a column for a measurement nobody took.
//
// ⚠️ NO PERCENTILES, RANKS OR "TOP PERFORMER" LABELS. Against a book of dozens a
// percentile is a rank wearing a lab coat, and a label is a judgement the data
// cannot support. The table plus a median is honest at any N — which is why the
// `posts` column sits beside the derived figures rather than at the far end,
// where a reader could take in an average without its sample size.
// ─────────────────────────────────────────────────────────────────────────────

const HEAD = "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase";
const NUM = "font-mono text-sm tabular-nums";

interface ComparisonColumnMeta {
  className?: string;
  sortLabel?: string;
  /**
   * The `metric-definitions.ts` key for an ⓘ beside this column's header.
   *
   * ⚠️ DECLARED HERE, RENDERED BY THE TABLE, for the same reason `columns.tsx`
   * does it on the posts screen: this table's header content is placed INSIDE
   * the sort `<button>`, so an ⓘ returned from `header` would be a button nested
   * in a button — invalid markup, unreachable by keyboard.
   */
  infoMetric?: string;
}

/**
 * The em dash for a value that is NOT KNOWN.
 *
 * ⚠️ NEVER for a zero. A `0` is a measured fact; this is the absence of one. The
 * spoken text carries the difference, because the glyph alone is
 * indistinguishable from an empty cell.
 */
function Unknown({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{what} not reported</span>
    </>
  );
}

/**
 * A right-aligned, nullable metric column.
 *
 * ⚠️ `accessorFn` maps `null` → `undefined` so `sortUndefined: "last"` can park
 * it at the bottom in BOTH directions. Sorting a null as 0 would rank a Client
 * we could not measure as the worst on the book — the per-post table's
 * convention, matched here deliberately.
 */
function metric(
  id: "avgImpressions" | "engagementRate" | "followers" | "interactionsPer1K" | "connections",
  header: string,
  sortLabel: string,
  format: (v: number) => string,
  unknownLabel: string,
  infoMetric: string,
): ColumnDef<ClientComparisonRow> {
  return {
    id,
    accessorFn: (r) => r[id] ?? undefined,
    sortUndefined: "last",
    header: () => <span className={`${HEAD} block text-right`}>{header}</span>,
    meta: {
      className: "text-right whitespace-nowrap",
      sortLabel,
      infoMetric,
    } satisfies ComparisonColumnMeta,
    cell: ({ row }) => {
      const value = row.original[id];
      return (
        <span className={NUM}>
          {value === null ? <Unknown what={unknownLabel} /> : format(value)}
        </span>
      );
    },
  };
}

const columns: ColumnDef<ClientComparisonRow>[] = [
  {
    id: "clientName",
    accessorFn: (r) => r.clientName,
    header: () => <span className={HEAD}>Client</span>,
    meta: { sortLabel: "client name" } satisfies ComparisonColumnMeta,
    cell: ({ row }) => (
      <Link
        href={paths.clients.details(row.original.clientId)}
        className="font-medium underline-offset-4 hover:underline"
      >
        {row.original.clientName}
      </Link>
    ),
  },
  {
    // ⚠️ SECOND COLUMN, IMMEDIATELY BEFORE THE DERIVED FIGURES. It is the sample
    // size every average in the row depends on, and it is ALWAYS a real number —
    // a registered Client who published nothing scored 0, which is a finding.
    id: "posts",
    accessorFn: (r) => r.posts,
    header: () => <span className={`${HEAD} block text-right`}>Posts</span>,
    meta: {
      className: "text-right",
      sortLabel: "posts",
      infoMetric: "comparisonPosts",
    } satisfies ComparisonColumnMeta,
    cell: ({ row }) => <span className={NUM}>{row.original.posts.toLocaleString("en-US")}</span>,
  },
  metric(
    "avgImpressions",
    "Avg impressions",
    "average impressions",
    (v) => Math.round(v).toLocaleString("en-US"),
    "Average impressions",
    "avgImpressions",
  ),
  // ⚠️ `engagementRatePerClient`, AND THE KEY IS DOING REAL WORK. This column,
  // the dashboard's engagement chart, the posts table's column and the median
  // cell below all print a form of "engagement rate" over FOUR DIFFERENT
  // statistics. This one is a single client's interactions over their own
  // impressions in the window. The definitions are what keep them apart.
  metric(
    "engagementRate",
    // ⚠️ "Engagement rate", NOT "Engagement". This column holds a percentage,
    // and the shorter word was the one place in the app that named this
    // measurement differently from every other screen — a sixth spelling of a
    // label that already denotes four distinct statistics. The header now
    // matches its own sort label, its "not reported" text and the accessible
    // name on the cell; the ⓘ beside it is what says WHICH rate this is.
    "Engagement rate",
    "engagement rate",
    (v) => `${v.toFixed(1)}%`,
    "Engagement rate",
    "engagementRatePerClient",
  ),
  metric(
    "followers",
    "Followers",
    "followers",
    (v) => v.toLocaleString("en-US"),
    "Followers",
    "followers",
  ),
  metric(
    "interactionsPer1K",
    "Per 1K followers",
    "interactions per 1,000 followers",
    (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }),
    "Interactions per 1,000 followers",
    "interactionsPer1K",
  ),
  // ⚠️ A RAW COUNT, AND DELIBERATELY THE LAST COLUMN. Connections carries NO
  // per-1,000 rate — that derived column was removed, and the asymmetry with
  // Followers beside it is intended rather than an oversight. Keeping the bare
  // count at the end means the normalised figures stay grouped together and a
  // reader is never invited to read this one as a rate.
  metric(
    "connections",
    "Connections",
    "connections",
    (v) => v.toLocaleString("en-US"),
    "Connections",
    "connections",
  ),
];

/** Sample size first: the most defensible default, and not a ranking on a rate. */
const DEFAULT_SORTING: SortingState = [{ id: "posts", desc: true }];

/**
 * One median cell, always carrying the population it was drawn from.
 *
 * ⚠️ THE COUNT IS NOT DECORATION. A median over three Clients and one over
 * thirty are different claims, and a bare number lets a reader mistake the first
 * for the second.
 */
function MedianCell({
  median,
  format,
  noun,
  infoMetric,
}: {
  median: ComparisonMedian;
  format: (v: number) => string;
  noun: string;
  /**
   * ⚠️ SET ONLY ON THE ENGAGEMENT ROW, AND ON PURPOSE. A median across CLIENTS
   * is a different statistic from the column it sits under, and "engagement
   * rate" is the one label in this app that already denotes four things — so
   * this cell is the fourth, and the only median here that needs saying apart.
   * The other medians are the same measurement as their column, whose header
   * ⓘ already defines them.
   */
  infoMetric?: string;
}) {
  // ⚠️ THE ⓘ RENDERS IN BOTH BRANCHES, INCLUDING THE DASH. The definition is
  // what explains the dash — a median is taken only over clients that HAVE the
  // figure, so "no client has one" and "the median is zero" are different
  // sentences and this is where a reader learns which they are looking at.
  const info = infoMetric ? <MetricInfo metric={infoMetric} className="ml-1.5" /> : null;

  if (median.value === null) {
    return (
      <span className={NUM}>
        <span aria-hidden>—</span>
        <span className="sr-only">No client has a {noun} to take a median of</span>
        {info}
      </span>
    );
  }
  return (
    <span className={NUM}>
      {format(median.value)}
      <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
        of {median.clients.toLocaleString("en-US")} {median.clients === 1 ? "client" : "clients"}
      </span>
      {info}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Client comparison
      </div>
      {children}
    </section>
  );
}

export function ClientComparisonTable({ comparison }: { comparison: ClientComparison }) {
  const [sorting, setSorting] = React.useState<SortingState>(DEFAULT_SORTING);

  const table = useReactTable({
    data: comparison.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // The read FAILED. Distinct from an empty book, and never shown as one — the
  // same rule the page applies to `unavailable`.
  if (comparison.unavailable) {
    return (
      <Shell>
        <p className="py-8 text-center text-sm text-muted-foreground">
          The client list could not be read, so there is no comparison to show.
        </p>
      </Shell>
    );
  }

  if (comparison.rows.length === 0) {
    return (
      <Shell>
        <p className="py-8 text-center text-sm text-muted-foreground">No clients registered yet.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ComparisonColumnMeta | undefined;
                  const direction = header.column.getIsSorted();
                  const label = flexRender(header.column.columnDef.header, header.getContext());
                  const info = meta?.infoMetric ? metricDefinition(meta.infoMetric) : undefined;
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      className={meta?.className}
                      // ⚠️ AN EXPLICIT NAME WHERE AN ⓘ SITS. A `<th>` computes
                      // its name from its content, so the ⓘ's own label ("What
                      // is Engagement rate?") would otherwise be announced as
                      // part of this column on every cell in it. Both buttons
                      // stay individually reachable under their own names.
                      aria-label={info?.term}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1.5 transition-colors hover:text-foreground",
                            meta?.className?.includes("text-right") && "flex-row-reverse",
                          )}
                          aria-label={`Sort by ${meta?.sortLabel ?? header.column.id}`}
                        >
                          {label}
                          {direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : direction === "desc" ? (
                            <ArrowDown className="size-3" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      )}
                      {/* ⚠️ A SIBLING OF THE SORT CONTROL, NEVER INSIDE IT — the
                          header above is rendered within that button. The icon
                          carries no text, so a header's `textContent` is
                          unchanged and the column-order tests still read it. */}
                      {meta?.infoMetric ? (
                        <MetricInfo metric={meta.infoMetric} className="ml-1.5" />
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as ComparisonColumnMeta | undefined;
                  return (
                    <TableCell key={cell.id} className={cn(meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className={HEAD}>Median</TableCell>
              {/* Posts has no median cell: the column is the sample size itself. */}
              <TableCell />
              <TableCell className="text-right whitespace-nowrap">
                <MedianCell
                  median={comparison.medians.avgImpressions}
                  format={(v) => Math.round(v).toLocaleString("en-US")}
                  noun="average impressions figure"
                />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <MedianCell
                  median={comparison.medians.engagementRate}
                  format={(v) => `${v.toFixed(1)}%`}
                  noun="engagement rate"
                  infoMetric="engagementRateMedianAcrossClients"
                />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <MedianCell
                  median={comparison.medians.followers}
                  format={(v) => v.toLocaleString("en-US")}
                  noun="follower count"
                />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <MedianCell
                  median={comparison.medians.interactionsPer1K}
                  format={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                  noun="interactions-per-1,000 figure"
                />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <MedianCell
                  median={comparison.medians.connections}
                  format={(v) => v.toLocaleString("en-US")}
                  noun="connection count"
                />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* ⚠️ STATED, NEVER SILENTLY DROPPED. Attribution happens after ArcBase
          submits a Post (ADR 0009), so posts matching no registered Client are
          expected — and without this line the rows above cannot be reconciled
          against the post count at the top of the page. */}
      {comparison.unattributedPosts > 0 ? (
        <p className="text-sm text-muted-foreground">
          {comparison.unattributedPosts.toLocaleString("en-US")} posts in this range came back
          attributed to no registered client, so they count in the totals above but appear in no row
          below. Attribution happens after ArcBase submits a post, by matching the client&rsquo;s
          name.
        </p>
      ) : null}

      {/* ⚠️ "COULD NOT BE READ", NOT "HAS NONE". When the follower upload read
          fails, the Followers and Per 1K followers columns em-dash for every row
          — identical to a book where nobody recorded a count. This line keeps the
          two facts apart so a reader retries the read rather than concluding the
          clients simply have no followers. The other four columns are unaffected
          and still shown. */}
      {comparison.followersUnavailable ? (
        <p className="text-sm text-muted-foreground">
          Follower figures could not be read for this range, so the Followers and Per 1K followers
          columns are blank for every client. This is a read that failed, not an absence of
          followers &mdash; the other columns are unaffected.
        </p>
      ) : null}

      {/* ⚠️ ITS OWN NOTE, NOT A CLAUSE IN THE ONE ABOVE. A blank Connections
          column is the ORDINARY state — the count is optional at capture and
          most uploads carry none — so this note fires ONLY on a failed read.
          Sharing wording with the follower note would either leave a real outage
          in this column unexplained, or turn the everyday gap into a false
          alarm. It names ONE column, because there is now only one. */}
      {comparison.connectionsUnavailable ? (
        <p className="text-sm text-muted-foreground">
          Connection figures could not be read for this range, so the Connections column is blank
          for every client. This is a read that failed, not an absence of connections.
        </p>
      ) : null}
    </Shell>
  );
}
