import { cookies } from "next/headers";

import { asPage, readAllPages, type PagedRead, type PageReader } from "@/lib/supabase/paged";
import { createClient } from "@/lib/supabase/server";
import { effectiveMs, type BiPostRow } from "@/services/analytics";
import type { ReportPeriod } from "@/services/types";

// The paging itself lives in `@/lib/supabase/paged` — the ONE implementation
// every all-table read shares. Re-exported here because this module's callers
// and tests have always read the two constants from it.
export { PAGE_SIZE, MAX_PAGES } from "@/lib/supabase/paged";

// ─────────────────────────────────────────────────────────────────────────────
// The shared BI post-row seam: ONE paged read of `bi.linkedin_post_latest` and
// ONE period-selection predicate, used by every screen that shows a client's
// posts (the LinkedIn Report and the per-post drill-down).
//
// ⚠️ THIS MODULE EXISTS TO MAKE TWO SCREENS STRUCTURALLY UNABLE TO DISAGREE.
//
// The report says "12 posts in July"; the drill-down lists the posts behind that
// figure. If each owned its own copy of the half-open window, its own
// undatable-row rule, or its own paging, the two could drift apart for a client
// nobody is looking at — and a table that contradicts the number above it
// discredits both. Two carefully-kept-in-sync copies is a defect waiting to
// happen; one implementation cannot disagree with itself.
//
// So: do not inline these predicates at a call site, and do not add a second
// paged read of this view. Import from here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The columns every post-reading screen needs. `post_url` is here for the
 * drill-down's outbound link; the report ignores it.
 *
 * BOTH engagement-rate columns are selected, and that is deliberate:
 *   • `calculated_engagement_rate` — the VIEW's per-post figure, and the one
 *     ArcBase ships. Per ADR 0009 the BI views own the analytics contract, so
 *     ArcBase reads their number rather than deriving a rival one.
 *   • `provided_engagement_rate` — the SCRAPER's own figure. Never rendered.
 *     Read solely so the Data Quality panel can RECONCILE the two and report
 *     where they disagree.
 *
 * Reading both is what makes a disagreement visible instead of a matter of which
 * column someone happened to pick.
 */
const POST_COLUMNS =
  "client_id, linkedin_post_id, post_url, post_content, post_age, estimated_post_date, impressions, likes, comments, reposts, saves, interactions, provided_engagement_rate, calculated_engagement_rate, scraped_at";

/**
 * A row paired with its RESOLVED timestamp — the placeable subset. `ms` is the
 * WINDOWING key (`effectiveMs`), never a publish date for display.
 */
export interface PlacedRow {
  row: BiPostRow;
  ms: number;
}

/** A row paired with its resolved timestamp; `ms` is null when undatable. */
interface DatedRow {
  row: BiPostRow;
  ms: number | null;
}

export function withDates(rows: BiPostRow[]): DatedRow[] {
  return rows.map((row) => ({ row, ms: effectiveMs(row) }));
}

/**
 * Half-open [start, end) bounds in ms. All-time is unbounded.
 *
 * Exported because the report anchors its "prior 3 months" comparison on the
 * month the period STARTS in, and a private second copy of these bounds is the
 * duplication this module exists to remove.
 */
export function periodRange(period: ReportPeriod): { start: number; end: number } {
  switch (period.kind) {
    case "month":
      return {
        start: Date.UTC(period.year, period.month, 1),
        end: Date.UTC(period.year, period.month + 1, 1),
      };
    case "quarter": {
      const firstMonth = (period.quarter - 1) * 3;
      return {
        start: Date.UTC(period.year, firstMonth, 1),
        end: Date.UTC(period.year, firstMonth + 3, 1),
      };
    }
    case "year":
      return { start: Date.UTC(period.year, 0, 1), end: Date.UTC(period.year + 1, 0, 1) };
    case "all":
      return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY };
  }
}

/**
 * The period's DATABLE rows, kept with their timestamps.
 *
 * Anything that has to place a post on a time axis reads this rather than
 * `selectPeriodRows` — which for all-time is every row, including rows that
 * could not be dated at all.
 */
export function selectPeriodPlaceable(rows: BiPostRow[], period: ReportPeriod): PlacedRow[] {
  const placeable = withDates(rows).filter((d): d is PlacedRow => d.ms !== null);
  if (period.kind === "all") return placeable;
  const { start, end } = periodRange(period);
  return placeable.filter((d) => d.ms >= start && d.ms < end);
}

/**
 * Every row in the period.
 *
 * ⚠️ ALL-TIME IS NOT A WIDE WINDOW — it is EVERY ROW, datable or not. A post
 * scraped with an hour-granularity age can still be counted and grouped by asset
 * type; it just cannot be placed on a time axis. Filtering all-time through the
 * bounds would silently drop those rows, and the count above the table would
 * stop matching the rows in it.
 */
export function selectPeriodRows(rows: BiPostRow[], period: ReportPeriod): BiPostRow[] {
  if (period.kind === "all") return rows;
  return selectPeriodPlaceable(rows, period).map((d) => d.row);
}

/** The label every warning from this view carries. */
const BI_LABEL = "bi.linkedin_post_latest";

/**
 * A `PageReader` over the BI view, optionally filtered to one client.
 *
 * The Supabase client is built on the FIRST page and reused, so it is created
 * once per read AND inside `readAllPages`'s try — meaning a throw from
 * `createClient` still degrades to `unavailable` rather than escaping.
 *
 * ⚠️ `POST_COLUMNS` AND `BiPostRow` ARE A PAIR. `asPage` asserts the row type
 * rather than checking it (see its doc comment), so adding a column here without
 * adding the field there — or vice versa — compiles cleanly and misleads at
 * runtime. Edit the two together.
 */
function postPageReader(clientId?: string): PageReader<BiPostRow> {
  let supabase: ReturnType<typeof createClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createClient(cookies());
    const base = supabase.schema("bi").from("linkedin_post_latest").select(POST_COLUMNS, opts);
    const scoped = clientId === undefined ? base : base.eq("client_id", clientId);
    return asPage<BiPostRow>(
      scoped
        // Stable ordering — without it, CONCURRENT ranges can overlap or skip
        // rows. Required on every page, not just the first.
        .order("linkedin_post_id", { ascending: true })
        .range(from, to),
    );
  };
}

/**
 * A client's full post history from the externally-owned BI view.
 *
 * `unavailable: true` means the read FAILED and is distinct from an empty
 * history — never collapse the two. Degrades rather than throwing so a page
 * shows a banner instead of an error boundary.
 *
 * ⚠️ DISCARDS `truncated` ON PURPOSE, FOR NOW. The report and posts screens have
 * no way to say "this is incomplete" yet, so a truncated read still reaches them
 * as if whole — pre-existing behaviour, preserved here so this extraction stays
 * a refactor. `readAllPages` now surfaces the flag, so wiring it into those two
 * screens is a small, separate change.
 */
export async function readClientPostRows(
  clientId: string,
): Promise<{ rows: BiPostRow[]; unavailable: boolean }> {
  const { rows, unavailable } = await readAllPages(postPageReader(clientId), BI_LABEL);
  return { rows, unavailable };
}

/**
 * EVERY client's posts, in one paged read — the whole view, unfiltered.
 *
 * Returns `truncated` rather than swallowing it: the Data Quality screen reports
 * across the entire client book, so a capped read makes every figure on it a
 * lower bound, and it has to be able to say so.
 */
export async function readAllPostRows(): Promise<PagedRead<BiPostRow>> {
  return readAllPages(postPageReader(), BI_LABEL);
}
