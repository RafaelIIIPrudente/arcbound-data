import { cookies } from "next/headers";

import { toCanonicalFormat, FORMAT_LABELS } from "@/lib/post-format";
import { createClient } from "@/lib/supabase/server";
import { effectiveMs, type BiPostRow } from "@/services/analytics";
import { listPostAttributes, toFormatMap } from "@/services/post-attributes";
import { listUploads } from "@/services/uploads";
import type {
  AssetBucket,
  ClientReport,
  InteractionsRow,
  MatrixRow,
  ImpressionsBucket,
  MonthPoint,
  PostFormat,
  ReportFigure,
  ReportPeriod,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Client LinkedIn Report seam. Joins two reads by linkedin_post_id:
//   • bi.linkedin_post_latest — the externally-owned view (metrics + dates)
//   • public.post_attributes  — app-owned; the ONLY source of a post's asset
//                               type, because the BI view doesn't expose it
//
// All aggregation lives in the pure `buildClientReport` (injected `now`), so the
// whole report is deterministically unit-testable without touching a database.
//
// ⚠️ ADR 0009: raw values are never rewritten. `toCanonicalFormat` is applied at
// READ time, for grouping only — nothing here is ever written back.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── pure helpers ─────────────────────────────────────────────────────────────

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : round1(values.reduce((s, v) => s + v, 0) / values.length);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** A row paired with its resolved timestamp; `ms` is null when undatable. */
interface DatedRow {
  row: BiPostRow;
  ms: number | null;
}

function withDates(rows: BiPostRow[]): DatedRow[] {
  return rows.map((row) => ({ row, ms: effectiveMs(row) }));
}

// ── periods ──────────────────────────────────────────────────────────────────

/**
 * Every period the data actually covers — months, quarters and years — newest
 * first within each kind, with all-time first. Grouped in exactly the order the
 * picker renders them.
 */
export function availablePeriods(rows: BiPostRow[]): ReportPeriod[] {
  const months = new Set<string>();
  for (const { ms } of withDates(rows)) {
    if (ms === null) continue;
    const d = new Date(ms);
    months.add(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }

  const parsed = [...months]
    .map((key) => {
      const [y, m] = key.split("-");
      return { year: Number(y), month: Number(m) - 1 };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const years = [...new Set(parsed.map((p) => p.year))].sort((a, b) => b - a);
  const quarters = [
    ...new Map(
      parsed.map((p) => {
        const quarter = Math.floor(p.month / 3) + 1;
        return [`${p.year}-Q${quarter}`, { year: p.year, quarter }];
      }),
    ).values(),
  ].sort((a, b) => b.year - a.year || b.quarter - a.quarter);

  return [
    { kind: "all", key: "all", label: "All time" },
    ...years.map<ReportPeriod>((year) => ({
      kind: "year",
      key: String(year),
      label: String(year),
      year,
    })),
    ...quarters.map<ReportPeriod>(({ year, quarter }) => ({
      kind: "quarter",
      key: `${year}-Q${quarter}`,
      label: `Q${quarter} ${year}`,
      year,
      quarter,
    })),
    ...parsed.map<ReportPeriod>(({ year, month }) => ({
      kind: "month",
      key: monthKey(year, month),
      label: `${MONTH_NAMES[month]} ${year}`,
      year,
      month,
    })),
  ];
}

/**
 * Resolve a URL `period` value against what the data supports. An unknown or
 * absent value falls back to the most recent MONTH with data (the report's most
 * useful default), and to all-time only when there is no month at all.
 */
export function parseReportPeriod(
  value: string | undefined,
  available: ReportPeriod[],
): ReportPeriod {
  const match = value ? available.find((p) => p.key === value) : undefined;
  if (match) return match;
  // `available` is already newest-first within each kind.
  const newestMonth = available.find((p) => p.kind === "month");
  return newestMonth ?? { kind: "all", key: "all", label: "All time" };
}

/** Half-open [start, end) bounds in ms. All-time is unbounded. */
function periodRange(period: ReportPeriod): { start: number; end: number } {
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

// ── asset-type grouping ──────────────────────────────────────────────────────

/**
 * Group posts by CANONICAL asset type. Raw storage means "DOCUMENT", "document"
 * and " Document " are three distinct strings in the table but one format here.
 * A post with no attribute record — or an unrecognised value — is UNKNOWN, which
 * is a real member of the vocabulary, not an error.
 */
function groupByFormat(
  rows: BiPostRow[],
  formatMap: Map<string, string>,
): Map<PostFormat, BiPostRow[]> {
  const groups = new Map<PostFormat, BiPostRow[]>();
  for (const row of rows) {
    const raw = formatMap.get(row.linkedin_post_id);
    const format = toCanonicalFormat(raw) ?? "UNKNOWN";
    const bucket = groups.get(format);
    if (bucket) bucket.push(row);
    else groups.set(format, [row]);
  }
  return groups;
}

// ── impressions series (period-scoped) ───────────────────────────────────────

/** A row paired with its RESOLVED timestamp — the placeable subset. */
interface PlacedRow {
  row: BiPostRow;
  ms: number;
}

/**
 * Average impressions per CALENDAR MONTH, from the first month with a post to
 * the last. A month with no posts is a GAP (`null`), never a zero — zero would
 * read as "we posted and got no reach", which is a different fact.
 */
function monthSeries(dated: PlacedRow[]): MonthPoint[] {
  if (dated.length === 0) return [];

  const buckets = new Map<string, number[]>();
  let firstMs = Infinity;
  let lastMs = -Infinity;
  for (const { row, ms } of dated) {
    const d = new Date(ms);
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
    const bucket = buckets.get(key);
    if (bucket) bucket.push(num(row.impressions));
    else buckets.set(key, [num(row.impressions)]);
    // Bounds accumulated in this pass, not by spreading every timestamp into
    // Math.min — that throws RangeError past the engine's argument limit.
    if (ms < firstMs) firstMs = ms;
    if (ms > lastMs) lastMs = ms;
  }

  const last = new Date(lastMs);
  const lastYear = last.getUTCFullYear();
  const lastMonth = last.getUTCMonth();
  const first = new Date(firstMs);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();

  const points: MonthPoint[] = [];
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const bucket = buckets.get(monthKey(year, month));
    points.push({
      label: `${SHORT_MONTHS[month]} ${String(year).slice(2)}`,
      value: bucket ? mean(bucket) : null,
    });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return points;
}

/**
 * Average impressions per WEEK within one calendar month.
 *
 * A month bucketed BY MONTH is a single bar, which is not a chart — so a month
 * period buckets by week instead. These are day-of-month blocks (1–7, 8–14, …),
 * not ISO weeks: a month is the only period this runs for, so blocks tile it
 * exactly, need no cross-month reasoning, and label themselves unambiguously.
 */
function weekSeries(dated: PlacedRow[], year: number, month: number): MonthPoint[] {
  if (dated.length === 0) return [];

  // Day 0 of the NEXT month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const bucketCount = Math.ceil(daysInMonth / 7);
  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);

  for (const { row, ms } of dated) {
    const day = new Date(ms).getUTCDate();
    // The last block absorbs the short tail (29–31) rather than orphaning it.
    const index = Math.min(Math.floor((day - 1) / 7), bucketCount - 1);
    buckets[index]!.push(num(row.impressions));
  }

  return buckets.map((bucket, i) => ({
    label: `${i * 7 + 1}–${Math.min((i + 1) * 7, daysInMonth)}`,
    value: bucket.length > 0 ? mean(bucket) : null,
  }));
}

// ── the aggregation (pure, deterministic given `now`) ────────────────────────

export interface BuildOptions {
  period: ReportPeriod;
  now: Date;
  /** Newest recorded follower count, or null when no upload carries one. */
  followers: number | null;
  /**
   * The periods the data supports — PASSED IN, not derived here.
   *
   * Every caller has already computed this to resolve `period`, and recomputing
   * it internally ran a second full `withDates` pass (date-parsing every row)
   * plus three sorts to produce a value the caller was already holding.
   *
   * Required rather than optional-with-a-default on purpose: a default would let
   * the double compute quietly return. It also SHADOWS the `availablePeriods`
   * function inside this scope, so recomputing here no longer type-checks.
   */
  availablePeriods: ReportPeriod[];
}

export function buildClientReport(
  rows: BiPostRow[],
  formatMap: Map<string, string>,
  { period, now, followers, availablePeriods }: BuildOptions,
): ClientReport {
  const dated = withDates(rows);
  const placeable = dated.filter((d): d is { row: BiPostRow; ms: number } => d.ms !== null);

  const { start, end } = periodRange(period);
  const selected =
    period.kind === "all"
      ? rows
      : placeable.filter((d) => d.ms >= start && d.ms < end).map((d) => d.row);

  // The period's DATABLE rows, kept with their timestamps. The charts need a
  // date to bucket by, so they read this rather than `selected` — which for
  // all-time is every row, including any that could not be dated at all.
  const selectedPlaceable =
    period.kind === "all" ? placeable : placeable.filter((d) => d.ms >= start && d.ms < end);

  // Prior 3 calendar months, counted back from the month the period starts in.
  // All-time has nothing before it, so it anchors on `now` instead — giving the
  // useful "last 3 months vs all time" contrast rather than a row of zeros.
  const anchor = period.kind === "all" ? now : new Date(start);
  const p3End = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1);
  const p3Start = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 3, 1);
  const prior3 = placeable.filter((d) => d.ms >= p3Start && d.ms < p3End).map((d) => d.row);

  const sum = (rs: BiPostRow[], pick: (r: BiPostRow) => number | null): number =>
    rs.reduce((s, r) => s + num(pick(r)), 0);

  // ── all-time monthly statistics (Key Performance ONLY) ─────────────────────
  //
  // ⚠️ DELIBERATELY ALL-TIME. `monthSpan`, `maxMonthlyPosts` and
  // `maxMonthlyInteractions` feed the Key Performance matrix, whose two rows are
  // all-time monthly statistics by design. The four CHARTS below moved to the
  // selected period; these three did NOT, and they must keep reading
  // `placeable` (the full datable history) rather than the period's subset.
  //
  // This walk used to also build `impressionsByMonth`, which is exactly why it
  // is now separate: sharing one loop meant one data source, and scoping the
  // chart would have silently rescoped the matrix to match.
  //
  // The window bounds are accumulated in the first pass rather than derived
  // after it. `Math.min(...times)` spread every timestamp into a single call,
  // which throws RangeError past the engine's argument limit (~100k–125k on
  // current V8) — a hard crash on a large client's history, not a slowdown.
  const monthly = new Map<string, BiPostRow[]>();
  let firstMs = Infinity;
  let lastMs = -Infinity;
  for (const { row, ms } of placeable) {
    const d = new Date(ms);
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
    const bucket = monthly.get(key);
    if (bucket) bucket.push(row);
    else monthly.set(key, [row]);
    if (ms < firstMs) firstMs = ms;
    if (ms > lastMs) lastMs = ms;
  }

  let monthSpan = 0;
  let maxMonthlyPosts = 0;
  let maxMonthlyInteractions = 0;

  // With no datable rows the bounds stay Infinity/-Infinity, so the walk must
  // not run — monthSpan stays 0 and the matrix reports 0 rather than NaN.
  if (placeable.length > 0) {
    const last = new Date(lastMs);
    const lastYear = last.getUTCFullYear();
    const lastMonth = last.getUTCMonth();
    const first = new Date(firstMs);
    let year = first.getUTCFullYear();
    let month = first.getUTCMonth();

    while (year < lastYear || (year === lastYear && month <= lastMonth)) {
      const bucket = monthly.get(monthKey(year, month)) ?? [];
      maxMonthlyPosts = Math.max(maxMonthlyPosts, bucket.length);
      maxMonthlyInteractions = Math.max(
        maxMonthlyInteractions,
        sum(bucket, (r) => r.interactions),
      );
      monthSpan += 1;
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  // ── impressions series (SELECTED PERIOD) ───────────────────────────────────
  //
  // Granularity follows the period: a month bucketed by month is a single bar,
  // so a month period buckets by WEEK. `impressionsBucket` travels with the data
  // so the card can title itself honestly rather than always claiming "month".
  const impressionsBucket: ImpressionsBucket = period.kind === "month" ? "week" : "month";
  const impressionsSeries =
    period.kind === "month"
      ? weekSeries(selectedPlaceable, period.year, period.month)
      : monthSeries(selectedPlaceable);

  // ── weekday buckets (SELECTED PERIOD) ──────────────────────────────────────
  const weekdayBuckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const { row, ms } of selectedPlaceable) {
    weekdayBuckets[new Date(ms).getUTCDay()]!.push(num(row.impressions));
  }
  const impressionsByWeekday = WEEKDAYS.map((label, i) => ({
    label,
    value: mean(weekdayBuckets[i]!),
  }));

  // ── asset-type buckets (SELECTED PERIOD) ───────────────────────────────────
  // ONE `groups` feeds BOTH asset charts, so scoping it scopes both.
  const groups = groupByFormat(selected, formatMap);
  const interactionsByAsset: AssetBucket[] = [...groups.entries()]
    .map(([format, bucket]) => ({
      format,
      label: FORMAT_LABELS[format],
      value: mean(bucket.map((r) => num(r.interactions))),
      count: bucket.length,
    }))
    .sort((a, b) => b.value - a.value);

  const postTypeDistribution: AssetBucket[] = [...groups.entries()]
    .map(([format, bucket]) => ({
      format,
      label: FORMAT_LABELS[format],
      // Share of the SELECTED period's posts, matching the bucket source above.
      value: selected.length > 0 ? round1((bucket.length / selected.length) * 100) : 0,
      count: bucket.length,
    }))
    .sort((a, b) => b.value - a.value);

  // ── figures ────────────────────────────────────────────────────────────────
  const totalInteractions = sum(rows, (r) => r.interactions);
  const avgInteractionsPerPost = rows.length > 0 ? totalInteractions / rows.length : 0;

  const keyPerformance = {
    selected: [
      { label: "Total posts", value: selected.length },
      { label: "Avg interactions", value: mean(selected.map((r) => num(r.interactions))) },
      // SUM THE FIELD — never likes + comments + reposts. `interactions` is its
      // own column in the externally-owned BI view and is not guaranteed to
      // equal its components (the view may count saves, clicks, or apply its
      // own definition). A derived total that disagreed with the per-metric
      // panels below would discredit the whole document.
      { label: "Total interactions", value: sum(selected, (r) => r.interactions) },
    ] satisfies ReportFigure[],
    // Two rows against three columns: posts · per-post rate · interaction
    // total. Same figures, same rounding, as the flat arrays this replaced —
    // the matrix only makes the structure that was always there visible.
    matrix: [
      {
        label: "Monthly avg",
        posts: {
          label: "Avg monthly posts",
          value: monthSpan > 0 ? round1(rows.length / monthSpan) : 0,
        },
        perPost: { label: "Avg interactions per post", value: round1(avgInteractionsPerPost) },
        interactions: {
          label: "Avg monthly interactions",
          value: monthSpan > 0 ? round1(totalInteractions / monthSpan) : 0,
        },
      },
      {
        label: "Monthly max",
        posts: { label: "Max monthly posts", value: maxMonthlyPosts },
        // A maximum has no per-post rate. The cell is genuinely absent, so it
        // renders as an em dash; a 0 here would assert something untrue.
        perPost: null,
        interactions: { label: "Max monthly interactions", value: maxMonthlyInteractions },
      },
    ] satisfies MatrixRow[],
    // Followers are captured per Upload, not per post, so this ratio pairs a
    // per-post average with a single point-in-time follower count. Marked
    // approximate so the UI can say so rather than implying precision.
    //
    // It stands apart from the matrix because it is an AVERAGE: it used to sit
    // in the maxima row, which nobody could see when the figures were nine
    // detached cards and which reads as an error once the rows are labelled.
    perThousandFollowers: {
      label: "Avg interactions per 1K followers",
      value:
        followers && followers > 0 ? round1((avgInteractionsPerPost / followers) * 1000) : null,
      approximate: true,
    } satisfies ReportFigure,
  };

  const comparisonRow = (
    scope: InteractionsRow["scope"],
    label: string,
    rs: BiPostRow[],
  ): InteractionsRow => ({
    scope,
    label,
    likes: sum(rs, (r) => r.likes),
    comments: sum(rs, (r) => r.comments),
    // `reposts` in the view; ALWAYS "Shares" to staff.
    shares: sum(rs, (r) => r.reposts),
  });

  return {
    period,
    availablePeriods,
    totalPostsAllTime: rows.length,
    keyPerformance,
    interactionsComparison: [
      comparisonRow("selected", period.label, selected),
      comparisonRow("prior3", "Prior 3 months", prior3),
      comparisonRow("allTime", "All time", rows),
    ],
    impressionsSeries,
    impressionsBucket,
    // The reference line must average the SAME data the chart draws, or it is a
    // line through someone else's numbers.
    impressionsAverage: mean(selectedPlaceable.map((d) => num(d.row.impressions))),
    impressionsByWeekday,
    interactionsByAsset,
    postTypeDistribution,
    // ── small-N honesty ──────────────────────────────────────────────────────
    // All-time framing guaranteed these charts drew on the full history. Scoped
    // to a month they may draw on a handful of posts, where "Image 40%" is noise
    // wearing the costume of a finding — so every chart states its own N.
    //
    // TWO counts because the charts genuinely differ: the impressions charts can
    // only plot rows that could be DATED, while the asset charts group every row
    // in the period. Reporting one number for both would overstate one of them.
    impressionsPostCount: selectedPlaceable.length,
    assetPostCount: selected.length,
  };
}

// ── I/O ──────────────────────────────────────────────────────────────────────

const REPORT_COLUMNS =
  "client_id, linkedin_post_id, post_content, post_age, estimated_post_date, impressions, likes, comments, reposts, saves, interactions, scraped_at";

/**
 * PostgREST caps a request at 1000 rows. The report needs a client's FULL
 * history (all-time averages, monthly maxima, a multi-year chart), so the read
 * MUST page — a silent truncation would look like working software while
 * reporting wrong numbers.
 */
export const PAGE_SIZE = 1000;

/**
 * Hard ceiling on pages per read — 50,000 rows. Exported so the tests assert
 * the cap the module actually enforces rather than restating the number.
 */
export const MAX_PAGES = 50;

export interface ClientReportOptions {
  clientId: string;
  period?: string;
}

export async function getClientReport({
  clientId,
  period,
}: ClientReportOptions): Promise<ClientReport> {
  const now = new Date();
  const fallback = (): ClientReport => {
    const periods = availablePeriods([]);
    return buildClientReport([], new Map(), {
      period: parseReportPeriod(period, periods),
      now,
      availablePeriods: periods,
      followers: null,
    });
  };

  let rows: BiPostRow[] = [];
  try {
    const supabase = createClient(cookies());

    const pageQuery = (page: number, opts?: { count: "exact" }) => {
      const from = page * PAGE_SIZE;
      return (
        supabase
          .schema("bi")
          .from("linkedin_post_latest")
          .select(REPORT_COLUMNS, opts)
          .eq("client_id", clientId)
          // Stable ordering — without it, CONCURRENT ranges can overlap or skip
          // rows. Required on every page, not just the first.
          .order("linkedin_post_id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
      );
    };

    // Page 0 carries the count that sizes the rest, so it is the one read that
    // genuinely has to go first. The serial walk it replaces cost one round-trip
    // PER PAGE because it only learned it was done by seeing a short page.
    //
    // The count must be "exact". "planned" and "estimated" are PostgREST's cheap
    // approximations, and an under-estimate would compute too few pages and drop
    // rows silently — the failure this paging exists to prevent.
    const firstPage = await pageQuery(0, { count: "exact" });
    if (firstPage.error) {
      console.warn(
        `Client report unavailable — bi.linkedin_post_latest read failed: ${firstPage.error.message}`,
      );
      return { ...fallback(), unavailable: true };
    }

    rows = (firstPage.data ?? []) as BiPostRow[];
    // A null count would mean the server ignored the option; fall back to what
    // page 0 actually returned rather than guessing at a total.
    const total = firstPage.count ?? rows.length;

    let pageCount = Math.ceil(total / PAGE_SIZE);
    if (pageCount > MAX_PAGES) {
      // The old loop hit this cap and truncated in SILENCE. The count makes the
      // truncation observable, which is the point of asking for it.
      console.warn(
        `Client report truncated — client ${clientId} has ${total} posts, above the ` +
          `${MAX_PAGES * PAGE_SIZE}-row read cap (${MAX_PAGES} pages × ${PAGE_SIZE}). ` +
          `Reporting on the first ${MAX_PAGES * PAGE_SIZE}.`,
      );
      pageCount = MAX_PAGES;
    }

    if (pageCount > 1) {
      // `Promise.all` preserves INPUT order, so the pages concatenate 1..n after
      // page 0 regardless of which returns first. Do not swap it for a construct
      // that resolves out of order.
      const rest = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) => pageQuery(i + 1)),
      );

      // ⚠️ SCAN EVERY PAGE BEFORE USING ANY OF THEM.
      //
      // Supabase RESOLVES with `{ error }` rather than rejecting, so a failed
      // page arrives looking like a normal result while its siblings hold real
      // rows. Concatenating what succeeded would report a partial history as a
      // complete one — a silent wrong number, which is worse than the
      // unavailable banner because it looks like data.
      for (const { error } of rest) {
        if (error) {
          console.warn(
            `Client report unavailable — bi.linkedin_post_latest read failed: ${error.message}`,
          );
          return { ...fallback(), unavailable: true };
        }
      }

      for (const { data } of rest) rows = rows.concat((data ?? []) as BiPostRow[]);
    }
  } catch (err) {
    console.warn(
      `Client report unavailable — bi.linkedin_post_latest read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ...fallback(), unavailable: true };
  }

  // The asset type lives in the app-owned table; both reads degrade to empty
  // rather than throwing, so a missing attribute shows as Unknown, not an error.
  const [attributes, uploads] = await Promise.all([
    listPostAttributes(rows.map((r) => r.linkedin_post_id)),
    listUploads(clientId),
  ]);

  // Computed ONCE per render, then used for both resolving the period and as the
  // report's own `availablePeriods`.
  // `listUploads` returns null when its read failed. Either way there is no
  // follower count to report, and `followers: null` already renders as absent —
  // so an unreadable uploads table behaves exactly as it did before.
  const latestWithFollowers = uploads?.find((u) => u.followerCount != null);
  const periods = availablePeriods(rows);

  return buildClientReport(rows, toFormatMap(attributes), {
    period: parseReportPeriod(period, periods),
    now,
    availablePeriods: periods,
    followers: latestWithFollowers?.followerCount ?? null,
  });
}
