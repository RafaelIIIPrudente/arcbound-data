"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ClientPostRow } from "@/services/types";

import { columns, type PostColumnMeta } from "./columns";

/**
 * The most-engaged post first — the question this screen exists to answer. The
 * seam already sorted the rows this way (its 2,000-row cap keeps the TOP posts,
 * which only means anything if the sort happens first), so this state agrees
 * with the data it is given rather than reordering it on mount.
 */
const DEFAULT_SORTING: SortingState = [{ id: "impressions", desc: true }];

/** Rows shown per page. A period can hold up to the seam's 2,000-row cap. */
const PAGE_SIZE = 20;

/**
 * The per-post drill-down table.
 *
 * Sorting AND pagination are client-side and ephemeral BY DESIGN — the page
 * already holds every row it was given, so neither needs a round-trip nor
 * belongs in the URL. Pagination runs AFTER sorting (TanStack applies the
 * pagination row model last), so the pager walks the fully-sorted set, not the
 * current page; changing the sort resets to page 1. The `?period=` param is the
 * one piece of state the server owns, written by the period picker, not here.
 * (Contrast clients-table.tsx, where the FILTER is a server concern in the URL.)
 */
export function PostsTable({ data }: { data: ClientPostRow[] }) {
  const [sorting, setSorting] = React.useState<SortingState>(DEFAULT_SORTING);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageCount = table.getPageCount();

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as PostColumnMeta | undefined;
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  const label = flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <TableHead key={header.id} scope="col" className={meta?.className}>
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1.5 transition-colors hover:text-foreground",
                            // Right-aligned columns put the caret on the LEFT of
                            // the label, so the numbers stay flush to the edge.
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
                      ) : (
                        label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as PostColumnMeta | undefined;
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
                {/* An EMPTY period, not a failure. A failed read never reaches
                  this component — the page renders <AnalyticsUnavailable/>
                  instead, so these two states can never be confused. */}
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No posts in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* The pager appears only once a second page exists — one page needs no
          controls, and a lone disabled "Next" is just noise. */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p
            className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase"
            aria-live="polite"
          >
            Page {table.getState().pagination.pageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
