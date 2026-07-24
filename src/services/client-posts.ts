import { FORMAT_LABELS, toCanonicalFormat } from "@/lib/post-format";
import { effectiveMs, type BiPostRow } from "@/services/analytics";
import { readClientPostRows, selectPeriodRows } from "@/services/bi-posts";
import { availablePeriods, parseReportPeriod } from "@/services/client-report";
import { listPostAttributes, toFormatMap } from "@/services/post-attributes";
import type { ClientPostRow, ClientPosts, PostFormat } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Per-post drill-down seam for `/clients/[id]/posts`. Joins the same two reads
// the report does — `bi.linkedin_post_latest` for the metrics, app-owned
// `public.post_attributes` for the asset type — and shapes them as table rows.
//
// ⚠️ IT ADDS NO DATA SOURCE AND OWNS NO PERIOD LOGIC. The paged read and the
// period predicate both come from `@/services/bi-posts`, which the report reads
// too. That is deliberate and load-bearing: this screen lists the posts behind
// the report's counts, so `totalInPeriod` and `ClientReport.assetPostCount` MUST
// be the same number. Reimplementing either here would let the table contradict
// the figure printed above it, which discredits both screens at once.
//
// ⚠️ ADR 0009: raw values are never rewritten. `toCanonicalFormat` runs at READ
// time so mixed-case storage resolves to one label; nothing is written back.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rows the table will render. Past this the browser, not the query, is the
 * bottleneck — every row is already in memory by the time we get here.
 *
 * ⚠️ TRUNCATION IS NEVER SILENT. When the cap bites, `cappedTo` is set and the
 * page states the cap AND the true total in plain language. A table that
 * quietly shows the first 2,000 of 3,412 reads as a complete answer.
 */
export const MAX_TABLE_ROWS = 2000;

/** Characters of `post_content` kept for the table cell. */
const SNIPPET_MAX = 120;

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * A metric that is genuinely nullable. Unlike `num`, this does NOT coerce an
 * absent value to 0 — `saves` may simply not have been scraped, and reporting
 * that as a measured zero invents a measurement (see `ClientPostRow.saves`).
 */
function nullableNum(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function snippet(content: string | null): string {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX).trimEnd()}…` : text;
}

/**
 * The RESOLVED publish date, or null.
 *
 * ⚠️ NEVER falls back to `scraped_at`. `effectiveMs` does, because windowing
 * needs SOME timestamp for an hour-age post — but the date a post was scraped
 * is not the date it was published on, and showing one as the other is a lie
 * the reader cannot detect. An hour-age post shows its raw `post_age` instead.
 */
function publishDate(row: BiPostRow): string | null {
  if (!row.estimated_post_date) return null;
  return Number.isNaN(Date.parse(row.estimated_post_date)) ? null : row.estimated_post_date;
}

function toPostRow(row: BiPostRow, formatMap: Map<string, string>): ClientPostRow {
  // A missing attribute record — or an unrecognised raw value — is UNKNOWN,
  // which is a real member of the vocabulary, not an error state.
  const format: PostFormat = toCanonicalFormat(formatMap.get(row.linkedin_post_id)) ?? "UNKNOWN";

  return {
    id: row.linkedin_post_id,
    url: row.post_url,
    snippet: snippet(row.post_content),
    date: publishDate(row),
    age: row.post_age,
    // The SAME key the report windows on, so sorting this column orders rows
    // the way every period boundary on the report already treats them.
    sortMs: effectiveMs(row),
    format,
    formatLabel: FORMAT_LABELS[format],
    impressions: num(row.impressions),
    likes: num(row.likes),
    comments: num(row.comments),
    // `reposts` in the view; ALWAYS "Shares" to staff.
    shares: num(row.reposts),
    saves: nullableNum(row.saves),
    interactions: num(row.interactions),
    // ⚠️ THE VIEW'S FIGURE, PASSED THROUGH UNTOUCHED. Not `interactions /
    // impressions` — ArcBase computes that only as a reconciliation check in the
    // Data Quality panel, and never renders it. A missing rate stays missing.
    engagementRate: nullableNum(row.calculated_engagement_rate),
  };
}

export interface ClientPostsOptions {
  clientId: string;
  period?: string;
}

export async function getClientPosts({
  clientId,
  period,
}: ClientPostsOptions): Promise<ClientPosts> {
  const { rows, unavailable } = await readClientPostRows(clientId);

  // A failed read is NOT an empty history. The flag travels so the page can show
  // the unavailable banner rather than "no posts in this period" — the period
  // still resolves, so the picker keeps working while access is restored.
  if (unavailable) {
    const periods = availablePeriods([]);
    return {
      period: parseReportPeriod(period, periods),
      availablePeriods: periods,
      rows: [],
      totalInPeriod: 0,
      cappedTo: null,
      unavailable: true,
    };
  }

  // Computed ONCE, then used both to resolve the period and as the screen's own
  // `availablePeriods` — the same single-compute the report seam does.
  const periods = availablePeriods(rows);
  const resolved = parseReportPeriod(period, periods);

  // THE shared predicate. `totalInPeriod` below is literally the report's
  // `assetPostCount`, because it is the same call on the same rows.
  const selected = selectPeriodRows(rows, resolved);

  // Only the period's posts need an asset type; the read degrades to [] rather
  // than throwing, so a failed join shows Unknown instead of erroring the page.
  const attributes = await listPostAttributes(selected.map((r) => r.linkedin_post_id));
  const formatMap = toFormatMap(attributes);

  // Sorted BEFORE the cap, so a capped table keeps the top posts rather than an
  // arbitrary 2,000. This also sets the table's default order.
  const mapped = selected
    .map((row) => toPostRow(row, formatMap))
    .sort((a, b) => b.impressions - a.impressions);

  const capped = mapped.length > MAX_TABLE_ROWS;

  return {
    period: resolved,
    availablePeriods: periods,
    rows: capped ? mapped.slice(0, MAX_TABLE_ROWS) : mapped,
    // The TRUE total, before the cap — the number the notice quotes, and the
    // number that has to match the report.
    totalInPeriod: mapped.length,
    cappedTo: capped ? MAX_TABLE_ROWS : null,
  };
}
