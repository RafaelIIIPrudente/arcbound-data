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

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  id: "avgImpressions" | "engagementRate" | "followers" | "interactionsPer1K",
  header: string,
  sortLabel: string,
  format: (v: number) => string,
  unknownLabel: string,
): ColumnDef<ClientComparisonRow> {
  return {
    id,
    accessorFn: (r) => r[id] ?? undefined,
    sortUndefined: "last",
    header: () => <span className={`${HEAD} block text-right`}>{header}</span>,
    meta: { className: "text-right whitespace-nowrap", sortLabel } satisfies ComparisonColumnMeta,
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
    meta: { className: "text-right", sortLabel: "posts" } satisfies ComparisonColumnMeta,
    cell: ({ row }) => <span className={NUM}>{row.original.posts.toLocaleString("en-US")}</span>,
  },
  metric(
    "avgImpressions",
    "Avg impressions",
    "average impressions",
    (v) => Math.round(v).toLocaleString("en-US"),
    "Average impressions",
  ),
  metric(
    "engagementRate",
    "Engagement",
    "engagement rate",
    (v) => `${v.toFixed(1)}%`,
    "Engagement rate",
  ),
  metric("followers", "Followers", "followers", (v) => v.toLocaleString("en-US"), "Followers"),
  metric(
    "interactionsPer1K",
    "Per 1K followers",
    "interactions per 1,000 followers",
    (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }),
    "Interactions per 1,000 followers",
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
}: {
  median: ComparisonMedian;
  format: (v: number) => string;
  noun: string;
}) {
  if (median.value === null) {
    return (
      <span className={NUM}>
        <span aria-hidden>—</span>
        <span className="sr-only">No client has a {noun} to take a median of</span>
      </span>
    );
  }
  return (
    <span className={NUM}>
      {format(median.value)}
      <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
        of {median.clients.toLocaleString("en-US")} {median.clients === 1 ? "client" : "clients"}
      </span>
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
                  return (
                    <TableHead key={header.id} scope="col" className={meta?.className}>
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
    </Shell>
  );
}
