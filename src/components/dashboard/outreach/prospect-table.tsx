"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canonicalReply, canonicalStage, REPLY_BUCKET_LABELS } from "@/lib/outreach-vocab";
import { cn } from "@/lib/utils";
import type { OutreachProspect } from "@/services/types";

import { prospectColumns, type ProspectColumnMeta } from "./prospect-columns";

// ─────────────────────────────────────────────────────────────────────────────
// The prospect table: every row of the latest snapshot, all 39 source columns,
// searchable, filterable and sortable entirely in the browser.
//
// ⚠️ NO NEW DATABASE READ. The page already fetched every row to compute the
// aggregates above; this component is handed the SAME array. Adding a query here
// would double a 1,435-row read to render a view of data already in memory.
//
// ⚠️ SEARCH, FILTER AND SORT RUN OVER THE WHOLE SET, PAGINATION LAST. TanStack
// applies the pagination row model after the sorted and filtered ones, so the
// pager walks the full result rather than re-sorting a page. Changing a filter
// or the sort resets to page 1 — the same contract `posts-table.tsx` documents.
//
// ⚠️ NOTHING HERE MAY LEAVE THE STAFF SURFACE. Prospect names, LinkedIn URLs,
// locations, drafted messages, the email addresses inside Notes, and now the
// 15 Email columns' own contact details (Email Address, Mobile) are
// third-party personal data (ADR 0012). There is deliberately no export, no
// download, and no copy-all control.
//
// ⚠️ THE LinkedIn / Email / All TOGGLE DEFAULTS TO LinkedIn, AND THAT DEFAULT
// IS A PRIVACY BOUNDARY (D5, 2026-08-03). All 39 columns exist in
// `prospectColumns` always; only VISIBILITY changes, via TanStack's
// `columnVisibility`. See the toggle's own comment below for why.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rows per page.
 *
 * ⚠️ A DELIBERATE DEVIATION FROM THE REFERENCE VIEWER'S SINGLE LONG LIST. 24
 * columns × 1,435 rows is roughly 34,000 table cells, and every one of them is a
 * DOM node the browser lays out on each filter keystroke. A hundred rows keeps
 * a page at ~2,400 cells — instant — while the search and filters still run
 * across all 1,435, so nothing is hidden from a query, only from one screen.
 */
const PAGE_SIZE = 100;

/** The "no filter" sentinel. Radix Select forbids an empty-string item value. */
const ALL = "__all__";

// ─────────────────────────────────────────────────────────────────────────────
// The LinkedIn / Email / All column-visibility toggle (D5, 2026-08-03).
//
// ⚠️ A PRIVACY BOUNDARY, NOT ONLY A LAYOUT CHOICE. Two of the 15 Email columns
// — `Email — Best Email`, `Email — Mobile` — are direct contact details for
// third parties who never agreed to be in ArcBase. Defaulting to LinkedIn
// keeps them hidden until a staffer deliberately asks for them; this is why
// `DEFAULT_CHANNEL_VIEW` below is `"linkedin"` and must stay that way.
//
// ⚠️ COLUMN IDS ARE DERIVED FROM `prospectColumns`' OWN `meta.channel`, NEVER
// HAND-TYPED HERE. A second list that must stay in step with the column
// definitions is exactly the `PROSPECT_COLUMNS` / `ProspectRow` drift risk
// this codebase has already been burned by once.
// ─────────────────────────────────────────────────────────────────────────────

type ChannelView = "linkedin" | "email" | "all";

const DEFAULT_CHANNEL_VIEW: ChannelView = "linkedin";

const EMAIL_COLUMN_IDS = prospectColumns
  .filter((c) => (c.meta as ProspectColumnMeta).channel === "email")
  .map((c) => c.id as string);

/**
 * LinkedIn columns MINUS `fullName`. `fullName` is the one identity column
 * shared by every view — an Email-only table with no name column would show
 * contact details with no way to say whose they are, which defeats the point
 * of switching to that view at all.
 */
const LINKEDIN_ONLY_COLUMN_IDS = prospectColumns
  .filter((c) => (c.meta as ProspectColumnMeta).channel === "linkedin" && c.id !== "fullName")
  .map((c) => c.id as string);

function visibilityFor(view: ChannelView): VisibilityState {
  if (view === "all") return {};
  const hidden = view === "linkedin" ? EMAIL_COLUMN_IDS : LINKEDIN_ONLY_COLUMN_IDS;
  return Object.fromEntries(hidden.map((id) => [id, false]));
}

/** Trimmed, non-blank values of one field, sorted, de-duplicated. */
function presentValues(
  prospects: OutreachProspect[],
  read: (p: OutreachProspect) => string | null,
): string[] {
  const seen = new Set<string>();
  for (const p of prospects) {
    const value = read(p);
    if (value !== null && value.trim() !== "") seen.add(value.trim());
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function ProspectTable({ prospects }: { prospects: OutreachProspect[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [channelView, setChannelView] = React.useState<ChannelView>(DEFAULT_CHANNEL_VIEW);
  const columnVisibility = React.useMemo(() => visibilityFor(channelView), [channelView]);

  // ⚠️ EVERY DROPDOWN IS BUILT FROM THIS SNAPSHOT, NOT FROM A FIXED LIST. A
  // Client whose sheet has never used "Closed - Low Fit" should not be offered
  // it: an option that can only ever return zero rows teaches the reader to
  // distrust the control.
  const connectionOptions = React.useMemo(
    () => presentValues(prospects, (p) => p.connectionStatus),
    [prospects],
  );
  const stageOptions = React.useMemo(
    () => presentValues(prospects, (p) => canonicalStage(p.stage)),
    [prospects],
  );
  const icpOptions = React.useMemo(() => presentValues(prospects, (p) => p.icpSeg), [prospects]);

  // ⚠️ BUCKETS, NOT RAW VALUES — the one dropdown that groups. Reply Status holds
  // 15 distinct strings, eight of which are single-row dates ("Replied
  // 2026-07-13"); offering those verbatim would be a fifteen-entry menu that is
  // mostly noise. The options are the canonical buckets actually present, and
  // the CELL still shows the raw text. The filter groups; it does not rename.
  const replyOptions = React.useMemo(() => {
    const seen = new Set<string>();
    for (const p of prospects) seen.add(REPLY_BUCKET_LABELS[canonicalReply(p.replyStatus)]);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  const table = useReactTable({
    data: prospects,
    columns: prospectColumns,
    state: { sorting, columnFilters, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // One haystack per row, matched case-insensitively — the same effect as the
    // reference viewer joining the row and substring-matching, and the reason a
    // search for "NASA" finds a company as readily as a name.
    globalFilterFn: (row, _columnId, value: string) => {
      const needle = String(value).trim().toLowerCase();
      if (needle === "") return true;
      const p = row.original;
      return Object.values(p).some(
        (field) => typeof field === "string" && field.toLowerCase().includes(needle),
      );
    },
  });

  const filtered = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  /** Set or clear one column filter. */
  const setFilter = (id: string, value: string) => {
    setColumnFilters((prev) => {
      const rest = prev.filter((f) => f.id !== id);
      return value === ALL ? rest : [...rest, { id, value }];
    });
  };
  const filterValue = (id: string) =>
    (columnFilters.find((f) => f.id === id)?.value as string | undefined) ?? ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search every column…"
            aria-label="Search prospects"
            className="max-w-sm"
          />
        </div>

        <FilterSelect
          label="Filter by connection status"
          allLabel="All connection statuses"
          value={filterValue("connectionStatus")}
          options={connectionOptions}
          onChange={(v) => setFilter("connectionStatus", v)}
        />
        <FilterSelect
          label="Filter by stage"
          allLabel="All stages"
          value={filterValue("stage")}
          options={stageOptions}
          onChange={(v) => setFilter("stage", v)}
        />
        <FilterSelect
          label="Filter by reply status"
          allLabel="All reply statuses"
          value={filterValue("replyStatus")}
          options={replyOptions}
          onChange={(v) => setFilter("replyStatus", v)}
        />
        <FilterSelect
          label="Filter by ICP segment"
          allLabel="All ICP segments"
          value={filterValue("icpSeg")}
          options={icpOptions}
          onChange={(v) => setFilter("icpSeg", v)}
        />

        <Select value={channelView} onValueChange={(v) => setChannelView(v as ChannelView)}>
          <SelectTrigger className="w-[9rem]" aria-label="Choose which columns to show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <p
          data-testid="prospect-count"
          aria-live="polite"
          className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase"
        >
          {filtered.toLocaleString("en-US")} of {prospects.length.toLocaleString("en-US")} shown
        </p>
      </div>

      {/* ⚠️ THE SCROLL LIVES HERE, ON THE TABLE'S OWN BOX. 24 columns overflow,
          and letting that overflow reach the document would drag the KPIs,
          funnel and charts sideways out from under the reader. The max height
          is what lets the header stick to something. */}
      <div
        data-table-scroll
        className="max-h-[70vh] overflow-x-auto overflow-y-auto rounded-md border"
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ProspectColumnMeta | undefined;
                  const direction = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      // Sticky so the column names survive a 100-row scroll —
                      // without it a 24-column table is unreadable past row ~15.
                      className={cn(
                        "sticky top-0 z-10 bg-card font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase",
                        meta?.className,
                      )}
                      title={meta?.sourceHeader}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                        aria-label={`Sort by ${meta?.sourceHeader ?? header.column.id}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {direction === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : direction === "desc" ? (
                          <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
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
                    const meta = cell.column.columnDef.meta as ProspectColumnMeta | undefined;
                    return (
                      <TableCell key={cell.id} className={cn("align-top", meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                {/* ⚠️ TWO DIFFERENT EMPTINESSES. "No prospects match" means the
                    query excluded everything; "No prospects in this snapshot"
                    means the upload carried none. A failed READ never reaches
                    this component — the page renders the unavailable panel
                    instead — so all three states stay apart. */}
                <TableCell colSpan={prospectColumns.length} className="h-24 text-center">
                  {prospects.length === 0
                    ? "No prospects in this snapshot."
                    : "No prospects match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[13rem]" aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
