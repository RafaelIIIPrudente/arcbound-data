import { bucketLabel, bucketPlan, decodeRange } from "@/lib/date-range";
import { toCanonicalFormat, FORMAT_LABELS } from "@/lib/post-format";
import { estMs, type BiPostRow } from "@/services/analytics";
import { buildCadence } from "@/services/cadence";
import { buildContentComposition } from "@/services/content-composition";
import {
  periodRange,
  readClientPostRows,
  selectPeriodPlaceable,
  selectPeriodRows,
  withDates,
  type PlacedRow,
} from "@/services/bi-posts";
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

/**
 * A per-post average expressed per 1,000 of an audience count.
 *
 * ⚠️ `null` WHEN THE AUDIENCE IS UNKNOWN OR ZERO. A rate per nothing is
 * undefined — not infinite, and not zero — and this report leaves the building
 * as a PDF, so a fabricated figure here is unrecallable.
 */
function perThousandOf(avgPerPost: number, audience: number | null): number | null {
  if (audience === null || audience <= 0) return null;
  return round1((avgPerPost / audience) * 1000);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
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
 * The prefix that keeps a custom window from colliding with a named period key.
 *
 * ⚠️ EXPORTED FOR THE DASHBOARD DRILL-THROUGH, AND FOR NOTHING ELSE. The
 * dashboard builds a `?period=` token from the window it is showing, and a
 * second hand-written `"custom:"` string over there is exactly how the two
 * screens would drift: `parseReportPeriod` does not throw on a token it cannot
 * read, it falls back to the newest MONTH, so a one-character divergence lands
 * the reader on a plausible, confident, wrong table. Exporting the constant is
 * the whole of the change — no behaviour in this file depends on it.
 */
export const CUSTOM_PREFIX = "custom:";

/**
 * A custom window's label — the only string staff ever read for it.
 *
 * Read straight off the day STRINGS rather than through a `Date`: these are
 * calendar days, not instants, and parsing them into a Date only to read the
 * parts back is how a UTC+8 machine renders "12 Jun" as "11 Jun".
 *
 * Title case, matching every other period label. `scopeCaption`'s existing rule
 * is that labels are proper nouns and are NOT lowercased — all-time alone is
 * prose — so this must not borrow the picker trigger's uppercase form.
 */
function customPeriodLabel(startDay: string, endDay: string): string {
  const part = (day: string) => {
    const [y, m, d] = day.split("-") as [string, string, string];
    return { y, month: SHORT_MONTHS[Number(m) - 1]!, d: String(Number(d)) };
  };
  const a = part(startDay);
  const b = part(endDay);

  if (startDay === endDay) return `${b.d} ${b.month} ${b.y}`;
  // The year is repeated only when the window crosses one, where printing it
  // once would attach the wrong year to the opening date.
  if (a.y !== b.y) return `${a.d} ${a.month} ${a.y} – ${b.d} ${b.month} ${b.y}`;
  return `${a.d} ${a.month} – ${b.d} ${b.month} ${b.y}`;
}

/**
 * Resolve a URL `period` value against what the data supports. An unknown or
 * absent value falls back to the most recent MONTH with data (the report's most
 * useful default), and to all-time only when there is no month at all.
 *
 * ⚠️ THE CUSTOM DECODE RUNS FIRST, AND MUST. A custom window is composed from
 * the URL rather than enumerated from the data, so it is NEVER in `available`
 * and the key match below could not possibly find it. `decodeRange` returns null
 * — never a guess — for a malformed day, an inverted range or the dashboard's
 * unprefixed dialect, and every one of those then falls through to the fallback
 * below EXACTLY as before.
 */
export function parseReportPeriod(
  value: string | undefined,
  available: ReportPeriod[],
): ReportPeriod {
  if (value !== undefined) {
    // `[]` for presets: this surface offers named periods, not day-counts, so
    // "30d" is not a period here and must not decode into one.
    const decoded = decodeRange(value, [], CUSTOM_PREFIX);
    if (decoded?.kind === "custom") {
      return {
        kind: "custom",
        key: value,
        label: customPeriodLabel(decoded.startDay, decoded.endDay),
        startDay: decoded.startDay,
        endDay: decoded.endDay,
      };
    }
  }
  const match = value ? available.find((p) => p.key === value) : undefined;
  if (match) return match;
  // `available` is already newest-first within each kind.
  const newestMonth = available.find((p) => p.kind === "month");
  return newestMonth ?? { kind: "all", key: "all", label: "All time" };
}

// ── asset-type grouping ──────────────────────────────────────────────────────

/**
 * Group posts by CANONICAL asset type. Raw storage means "DOCUMENT", "document"
 * and " Document " are three distinct strings in the table but one format here.
 * A post with no attribute record — or an unrecognised value — is UNKNOWN, which
 * is a real member of the vocabulary, not an error.
 */
function groupByFormat(rows: BiPostRow[]): Map<PostFormat, BiPostRow[]> {
  const groups = new Map<PostFormat, BiPostRow[]>();
  for (const row of rows) {
    // ⚠️ THE FORMAT NOW RIDES THE ROW (ADR 0010, S3). It used to come from a
    // second read of public.post_attributes joined in by id; `public.posts`
    // carries it, so the join and the extra round-trip are gone. Nothing else
    // about this function changed — an absent or unrecognised value is still
    // UNKNOWN, which is a real member of the vocabulary rather than an error.
    const raw = row.post_format_type ?? undefined;
    const format = toCanonicalFormat(raw) ?? "UNKNOWN";
    const bucket = groups.get(format);
    if (bucket) bucket.push(row);
    else groups.set(format, [row]);
  }
  return groups;
}

// ── impressions series (period-scoped) ───────────────────────────────────────

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

/** Calendar days a custom window covers, counting BOTH endpoints. */
function periodSpanDays(period: Extract<ReportPeriod, { kind: "custom" }>): number {
  const { start, end } = periodRange(period);
  // `end` is already the exclusive next-day boundary, so this is a whole number
  // of days without an off-by-one of its own.
  return Math.round((end - start) / 86_400_000);
}

/**
 * Average impressions per FIXED-WIDTH bucket across an arbitrary window.
 *
 * `weekSeries` cannot serve this: it tiles ONE calendar month by day-of-month
 * blocks and needs a year and a month, which a custom window does not have.
 * This walks the window itself, at the width `bucketPlan` chose, labelling each
 * bucket with S1's `bucketLabel` so the axis reads the same as the dashboard's.
 *
 * ⚠️ AN EMPTY BUCKET IS `null`, NOT `0` — the report's own rule, and the reason
 * this cannot just reuse the dashboard's series builder, which fills empties
 * with zero. A zero here reads as "we posted and got no reach", which is a
 * different fact from "we did not post".
 */
function windowSeries(
  dated: PlacedRow[],
  period: Extract<ReportPeriod, { kind: "custom" }>,
): MonthPoint[] {
  const { start } = periodRange(period);
  const plan = bucketPlan(periodSpanDays(period));
  // The report has no daily tier, so a short window is drawn at week width —
  // matching the `impressionsBucket` the card titles itself with.
  const widthMs = plan.unit === "day" ? 7 * 86_400_000 : plan.widthMs;
  const count = Math.ceil((periodSpanDays(period) * 86_400_000) / widthMs);

  const buckets: number[][] = Array.from({ length: count }, () => []);
  for (const { row, ms } of dated) {
    const index = Math.min(Math.max(Math.floor((ms - start) / widthMs), 0), count - 1);
    buckets[index]!.push(num(row.impressions));
  }

  return buckets.map((bucket, i) => ({
    label: bucketLabel(plan.unit === "day" ? "week" : plan.unit, start + i * widthMs),
    value: bucket.length > 0 ? mean(bucket) : null,
  }));
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
   * Newest recorded CONNECTION count, or null when no upload carries one.
   *
   * ⚠️ NULL IS THE COMMON CASE, NOT AN ERROR. Optional at capture, and absent
   * from every upload predating the column — so the ratio below is usually
   * genuinely unknown. Never substituted with `followers`.
   */
  connections: number | null;
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
  { period, now, followers, connections, availablePeriods }: BuildOptions,
): ClientReport {
  const placeable = withDates(rows).filter((d): d is PlacedRow => d.ms !== null);

  // Both selections come from `bi-posts`, which is also what the per-post
  // drill-down reads. That shared implementation is the ONLY reason the count
  // this report prints and the rows that screen lists cannot disagree.
  const selected = selectPeriodRows(rows, period);

  // The period's DATABLE rows, kept with their timestamps. The charts need a
  // date to bucket by, so they read this rather than `selected` — which for
  // all-time is every row, including any that could not be dated at all.
  const selectedPlaceable = selectPeriodPlaceable(rows, period);

  // Prior 3 calendar months, counted back from the month the period starts in.
  // All-time has nothing before it, so it anchors on `now` instead — giving the
  // useful "last 3 months vs all time" contrast rather than a row of zeros.
  const anchor = period.kind === "all" ? now : new Date(periodRange(period).start);
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

  // ⚠️ THE POSTS THE MONTHLY RATES ARE ALLOWED TO COUNT, AND THE REASON THEY ARE
  // A SEPARATE TALLY FROM `rows`. A per-month rate divides by `monthSpan`, and a
  // month span can only be measured from posts that HAVE a month — the BI view
  // leaves `estimated_post_date` NULL for hour-age scrapes, and `placeable` is
  // exactly the rows it did resolve. Counting every row against a span drawn
  // only from datable ones inflated both averages, and did it invisibly: the
  // maxima beside them come from `monthly`, which is also placeable-only, so a
  // client with enough undated posts printed an AVERAGE month larger than their
  // MAXIMUM month. The denominator was never wrong; the numerator was.
  //
  // ⚠️ THIS DOES NOT HIDE THE UNDATED POSTS. They still count in `Total posts`,
  // in `Total interactions`, in `Avg interactions per post` and in every
  // period-scoped figure — everywhere no month is involved. `cadence.ts` and the
  // weekday chart already refuse to place them for the same reason, and disclose
  // their number; this is that same rule reaching the one place it had not.
  const placeableRows = placeable.map((d) => d.row);
  const placeableInteractions = sum(placeableRows, (r) => r.interactions);

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
  //
  // ⚠️ A CUSTOM WINDOW CHOOSES ITS GRANULARITY FROM ITS SPAN, via the SAME
  // `bucketPlan` the dashboard uses — not a third scheme invented here. The one
  // adaptation: this report renders two granularities ("week" | "month"), while
  // `bucketPlan` also has a "day" tier, so a plan of "day" is drawn at the next
  // tier up. That keeps the card's "Average impressions by {bucket}" title true
  // of the bars beneath it, which is the binding rule on that component.
  const customPlan = period.kind === "custom" ? bucketPlan(periodSpanDays(period)) : null;
  const impressionsBucket: ImpressionsBucket = customPlan
    ? customPlan.unit === "month"
      ? "month"
      : "week"
    : period.kind === "month"
      ? "week"
      : "month";
  const impressionsSeries =
    period.kind === "custom"
      ? impressionsBucket === "month"
        ? monthSeries(selectedPlaceable)
        : windowSeries(selectedPlaceable, period)
      : period.kind === "month"
        ? weekSeries(selectedPlaceable, period.year, period.month)
        : monthSeries(selectedPlaceable);

  // ── weekday buckets (SELECTED PERIOD) ──────────────────────────────────────
  //
  // ⚠️ DATED BY `estMs` (estimated_post_date) ALONE — NOT the `ms` windowing key.
  // `selectedPlaceable`'s `ms` is `effectiveMs`, which stands `scraped_at` in for
  // an hour-age post's missing publish date; that is right for "is it in the
  // period", but a weekday may NOT be asserted that way. Every post in one weekly
  // scrape shares a `scraped_at`, so bucketing undated posts by it would pile a
  // scrape onto a single weekday and fabricate a rhythm in a CLIENT-FACING chart.
  // Undated posts are excluded and counted in `weekdayUndatedPosts` so the chart
  // can disclose the gap — mirroring the dashboard's weekday chart exactly.
  const weekdayBuckets: number[][] = Array.from({ length: 7 }, () => []);
  let weekdayUndatedPosts = 0;
  for (const { row } of selectedPlaceable) {
    const t = estMs(row);
    if (t === null) {
      weekdayUndatedPosts += 1;
      continue;
    }
    weekdayBuckets[new Date(t).getUTCDay()]!.push(num(row.impressions));
  }
  const impressionsByWeekday = WEEKDAYS.map((label, i) => ({
    label,
    value: mean(weekdayBuckets[i]!),
  }));

  // ── asset-type buckets (SELECTED PERIOD) ───────────────────────────────────
  // ONE `groups` feeds BOTH asset charts, so scoping it scopes both.
  const groups = groupByFormat(selected);
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
      // ⚠️ SUMMED OVER `selected`, NEVER OVER `selectedPlaceable`. "Total posts"
      // two lines above is `selected.length`, so these two figures must describe
      // the SAME population or they contradict each other beneath one period
      // caption. `selectedPlaceable` is the narrower DATABLE set, and it exists
      // for the CHARTS (`impressionsAverage`, `impressionsPostCount`) because a
      // chart cannot plot a post it cannot place on a timeline — an undated
      // post's impressions are still a real measurement, and dropping them here
      // would understate the total against a count that included the post.
      { label: "Total impressions", value: sum(selected, (r) => r.impressions) },
    ] satisfies ReportFigure[],
    // Two rows against three columns: posts · per-post rate · interaction
    // total. Same figures, same rounding, as the flat arrays this replaced —
    // the matrix only makes the structure that was always there visible.
    matrix: [
      {
        label: "Monthly avg",
        // Both rates divide the DATABLE posts by the span those same posts
        // define — see `placeableRows` above.
        posts: {
          label: "Avg monthly posts",
          value: monthSpan > 0 ? round1(placeableRows.length / monthSpan) : 0,
        },
        // ⚠️ OVER EVERY POST, AND CORRECTLY SO. This cell involves no month, so
        // its numerator and denominator already covered the same population.
        // Narrowing it to `placeable` to match its neighbours would discard real
        // measurements to buy a symmetry nothing needs — and would silently move
        // `perThousandFollowers`, which is computed from it.
        perPost: { label: "Avg interactions per post", value: round1(avgInteractionsPerPost) },
        interactions: {
          label: "Avg monthly interactions",
          value: monthSpan > 0 ? round1(placeableInteractions / monthSpan) : 0,
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
    // It stands apart from the matrix because it is an AVERAGE: it used to sit in
    // the maxima row, which nobody could see when the figures were nine detached
    // cards and which reads as an error once the rows are labelled.
    perThousandFollowers: {
      label: "Avg interactions per 1K followers",
      value: perThousandOf(avgInteractionsPerPost, followers),
      approximate: true,
    } satisfies ReportFigure,
    // ⚠️ PASSED THROUGH, NOT COMPUTED — AND NOT APPROXIMATE. This is the count a
    // person read off the scrape and typed in, so it is exact; it is deliberately
    // NOT divided into anything (connections has no per-1,000 twin, and the
    // asymmetry with followers above is intended). A recorded 0 stays 0; `null`
    // means no upload ever carried one, which is the ordinary case and renders as
    // an em dash. Never sourced from `followers`.
    //
    // ⚠️ IT IS POINT-IN-TIME, SO IT MUST NOT BE LABELLED "ALL TIME". The upload
    // carrying it may predate the latest scrape, which is also why the label
    // stays a plain noun rather than claiming a moment it cannot prove.
    connections: {
      label: "Connections",
      value: connections,
    } satisfies ReportFigure,
  };

  const comparisonRow = (
    scope: InteractionsRow["scope"],
    label: string,
    rs: BiPostRow[],
  ): InteractionsRow => {
    // ⚠️ SAVES IS COUNTED, NOT SUMMED THROUGH `num()`. The other three metrics
    // can safely coerce an absent value to 0; saves cannot, because the scrape
    // genuinely omits it and a 0 would report an absent measurement as a
    // measured one. So the posts that carried a value are counted separately,
    // which is what makes the three states below distinguishable.
    const withSaves = rs.filter((r) => typeof r.saves === "number" && Number.isFinite(r.saves));

    return {
      scope,
      label,
      likes: sum(rs, (r) => r.likes),
      comments: sum(rs, (r) => r.comments),
      // `reposts` in the view; ALWAYS "Shares" to staff.
      shares: sum(rs, (r) => r.reposts),
      // No post carried saves → we do not know, and an em dash says so.
      saves: withSaves.length === 0 ? null : sum(withSaves, (r) => r.saves),
      // Some did and some did not → the sum is real but INCOMPLETE, and the
      // table marks it as a lower bound rather than printing it as a total.
      savesPartial: withSaves.length > 0 && withSaves.length < rs.length,
    };
  };

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
    weekdayUndatedPosts,
    interactionsByAsset,
    postTypeDistribution,
    // FOLLOWS THE SELECTED PERIOD — computed over `selected` (the same period rows
    // the rest of the report uses), so "adjust to the time selected" holds and the
    // cadence total cannot disagree with the other period-scoped counts. Still
    // dated by `estimated_post_date` alone (see cadence.ts): an hour-age post that
    // the report windows in by scrape date is counted but never placed on the
    // timeline. No new query.
    cadence: buildCadence(selected, now),
    // FOLLOWS THE SELECTED PERIOD — computed over `selected`, like the temporal
    // sections and cadence, so the composition on screen describes the posts in the
    // window and the section moves with the picker. Pure over rows already read; no
    // new query. Compositional only — no engagement, no ranking.
    composition: buildContentComposition(selected),
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
//
// The paged `bi` read lives in `@/services/bi-posts`, which the per-post
// drill-down reads too. Do not re-implement it here.

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
    return buildClientReport([], {
      period: parseReportPeriod(period, periods),
      now,
      availablePeriods: periods,
      followers: null,
      connections: null,
    });
  };

  // A failed read is NOT an empty history: it returns the empty report under an
  // `unavailable` flag so the page shows a banner rather than "no posts yet".
  const { rows, unavailable, truncated, total } = await readClientPostRows(clientId);
  if (unavailable) return { ...fallback(), unavailable: true };

  // ⚠️ ONE READ WHERE THERE WERE TWO. The asset type used to require a second
  // query against public.post_attributes, joined back by post id; it is a column
  // on public.posts now, so it arrives with the row (ADR 0010, S3).
  const uploads = await listUploads(clientId);

  // Computed ONCE per render, then used for both resolving the period and as the
  // report's own `availablePeriods`.
  // `listUploads` returns null when its read failed. Either way there is no
  // follower count to report, and `followers: null` already renders as absent —
  // so an unreadable uploads table behaves exactly as it did before.
  const latestWithFollowers = uploads?.find((u) => u.followerCount != null);
  // ⚠️ A SEPARATE SEARCH, NOT THE SAME UPLOAD. The two counts are captured
  // independently — a scrape can record followers and no connections — so the
  // newest upload carrying a connection count may be an older one entirely.
  // Reading both off `latestWithFollowers` would report `null` for clients that
  // do have a connection count, just not on their most recent follower upload.
  const latestWithConnections = uploads?.find((u) => u.connectionsCount != null);
  const periods = availablePeriods(rows);

  return {
    ...buildClientReport(rows, {
      period: parseReportPeriod(period, periods),
      now,
      availablePeriods: periods,
      followers: latestWithFollowers?.followerCount ?? null,
      connections: latestWithConnections?.connectionsCount ?? null,
    }),
    // ⚠️ A READ CAP, NOT AN EMPTY HISTORY. `unavailable` above means nothing was
    // read; this means the pager stopped at its page cap, so every figure below —
    // and the printed PDF that carries them out of the building — is a lower
    // bound. `truncated` false leaves this null; the report then states nothing.
    truncation: truncated ? { read: rows.length, total } : null,
  };
}
