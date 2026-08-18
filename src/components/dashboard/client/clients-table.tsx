"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { MetricInfo } from "@/components/dashboard/metric-info";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { metricDefinition } from "@/lib/metric-definitions";
import { cn } from "@/lib/utils";
import type { ClientListRow } from "@/services/types";

import { columns, type ClientColumnMeta } from "./columns";

/** Keystrokes settle for this long before the URL is rewritten. */
const FILTER_DEBOUNCE_MS = 300;

/**
 * What each sortable column is CALLED when the sort control is announced.
 *
 * ⚠️ HARDCODED AND NOT DERIVED FROM THE HEADER, WHICH IS THE HAZARD AND THE
 * REASON THIS EXISTS AS A MAP. A header rename does not reach these strings —
 * "last upload" survived the rename to "Last ArcBase upload" here until it was
 * changed by hand — so `clients-table.test.tsx` pins each one to the visible
 * label. ⚠️ A NEW SORTABLE COLUMN MUST BE ADDED HERE; the fallback announces the
 * raw column id, which is wrong but at least never announces another column's
 * name, as an inherited `else` branch would.
 */
const SORT_LABELS: Record<string, string> = {
  name: "client",
  writer: "writer",
  lastUpload: "last ArcBase upload",
  postsCount: "posts",
};

/**
 * The Client List table.
 *
 * ⚠️ THE URL IS THE ONLY SOURCE OF TRUTH FOR THE FILTER. The input is
 * UNCONTROLLED (`defaultValue`) and writes `?q=`; the server component
 * re-fetches and re-renders. There is deliberately no React state mirroring the
 * text — an earlier version kept a TanStack `globalFilter` alongside a server
 * `q` that nothing ever wrote, so the visible filter was invisible to the URL
 * and the server half was dead code. Filtering now survives a reload and is
 * shareable as a link.
 *
 * Sorting is client-side and ephemeral by design: the page holds every row it
 * was given, so sorting needs no round-trip and does not belong in the URL.
 */
export function ClientsTable({ data, q = "" }: { data: ClientListRow[]; q?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  function onFilterChange(value: string) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, FILTER_DEBOUNCE_MS);
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <Input
        // Uncontrolled: the DOM holds the text, the URL holds the truth. `key`
        // resyncs it when the URL changes from outside (back/forward, a shared
        // link) without making this a controlled parallel copy.
        key={q}
        defaultValue={q}
        placeholder="Filter clients…"
        aria-label="Filter clients by name or LinkedIn URL"
        onChange={(event) => onFilterChange(event.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ClientColumnMeta | undefined;
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  const label = flexRender(header.column.columnDef.header, header.getContext());
                  const info = meta?.infoMetric ? metricDefinition(meta.infoMetric) : undefined;
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      className={cn(meta?.className, info && "whitespace-nowrap")}
                      // ⚠️ AN EXPLICIT NAME, AND ONLY WHERE AN ⓘ SITS. A `<th>`
                      // computes its name from its content, so without this the
                      // ⓘ's own label ("What is Posts?") would be read out as
                      // part of the column header on every cell in the column.
                      // Stating the name here keeps BOTH buttons out of it while
                      // leaving each individually reachable under its own name.
                      aria-label={info?.term}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                          // ⚠️ MUST AGREE WITH THE VISIBLE HEADER IN `columns.tsx`
                          // — see `SORT_LABELS` above for why it is spelled out
                          // there rather than derived from the header.
                          aria-label={`Sort by ${SORT_LABELS[header.column.id] ?? header.column.id}`}
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
                      ) : (
                        label
                      )}
                      {/* ⚠️ A SIBLING OF THE SORT CONTROL, NEVER INSIDE IT. The
                          sortable header's content is rendered within a
                          `<button>`, so an ⓘ placed in `columnDef.header` would
                          nest one button in another — invalid markup that no
                          keyboard can reach. `columns.tsx` therefore declares
                          the metric and this renders it. Unmapped keys render
                          nothing at all; `MetricInfo` owns that branch. */}
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="relative cursor-pointer">
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ClientColumnMeta | undefined;
                    return (
                      <TableCell key={cell.id} className={cn(meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {q ? `No clients match “${q}”.` : "No clients found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
