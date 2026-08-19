import { cookies } from "next/headers";

import { bucketLabel, bucketPlan, resolveWindow, type RangeSelection } from "@/lib/date-range";
import { median } from "@/lib/median";
import { asPage, readAllPages, type PageReader } from "@/lib/supabase/paged";
import { createClient } from "@/lib/supabase/server";
import { listClientRegistry } from "@/services/clients";
import { listAllUploads } from "@/services/uploads";
import type {
  ClientComparison,
  ClientComparisonRow,
  ComparisonMedian,
  DashboardAnalytics,
  Kpi,
  RecentPost,
  SeriesPoint,
  Upload,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Service Seam (dashboard read-model), now LIVE. Reads the APP-OWNED
// view `public.client_posts` — one row per post, attributed by the `client_id`
// foreign key stamped at upload — and aggregates it into DashboardAnalytics.
//
// ⚠️ IT READ THE EXTERNALLY-OWNED `bi.linkedin_post_latest` UNTIL ADR 0010. The
// row SHAPE did not change across that cutover, deliberately: `PostMetricsRow` is the
// firewall, and repointing the source cost one clause here and nothing at all in
// the aggregation below. The pure `buildDashboardAnalytics` still does every
// aggregation so it is deterministically unit-testable with an injected `now`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A row of the app-owned view `public.client_posts`, which projects
 * `public.posts` — one row per post, attributed by the `client_id` foreign key
 * stamped at upload.
 *
 * ⚠️ THIS IS THE FIREWALL. Every reporting surface consumes this shape and
 * nothing else, which is why moving the underlying source cost one clause per
 * read site and nothing downstream. Keep it in step with `POST_COLUMNS`
 * (`post-metrics.ts`) — `asPage` ASSERTS the row type rather than checking it.
 */
export interface PostMetricsRow {
  client_id: string;
  client_name: string | null;
  linkedin_post_id: string;
  post_url: string | null;
  post_content: string | null;
  /** Raw relative age, e.g. "23h"/"4d". */
  post_age: string | null;
  /**
   * Resolved publish instant, or NULL when none can be established.
   *
   * NULL for hour- and minute-grained ages ON PURPOSE — `src/lib/post-date.ts`
   * refuses to date them, because bucketing a weekly scrape's freshest posts onto
   * the scrape's own weekday fabricates a rhythm in a client-facing chart.
   */
  estimated_post_date: string | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  saves: number | null;
  interactions: number | null;
  provided_engagement_rate: number | null;
  calculated_engagement_rate: number | null;
  /**
   * The format EXACTLY as the Scrape sent it — any casing, never rewritten.
   *
   * ⚠️ CANONICALISE BEFORE GROUPING (`toCanonicalFormat`). "DOCUMENT",
   * "document" and " Document " are three distinct strings here and one format
   * in the report; grouping on the raw value splits one format into several
   * buckets. An unrecognised or absent value is UNKNOWN, which is a real member
   * of the vocabulary rather than an error.
   *
   * ⚠️ OPTIONAL BECAUSE OF THE DEPLOY WINDOW, not because it is unimportant. The
   * client-facing `/r/[token]` bundle may have been produced by the PREVIOUS
   * `report_link_read`, which had no such column; those rows fall back to the
   * bundle's `attributes[]` map (see `withFormatFallback`). Once the old function
   * is gone this can become required.
   */
  post_format_type?: string | null;
  scraped_at: string | null;
  uploaded_at: string | null;
}

// `RANGE_LABEL`, `RANGE_DAYS` and `RANGE_BUCKETS` are RETIRED, and the three
// preset strings with them. The window, its baseline and its bucketing all now
// come from `@/lib/date-range`, so a preset and a custom range of the same
// length are drawn and compared identically — `RANGE_BUCKETS` was a fixed bucket
// COUNT per preset, which cannot describe an arbitrary window at all. The
// "vs. prior …" copy is `spanLabel`, whose preset output ("30 days") is
// byte-identical to what `RANGE_LABEL` produced.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

export interface DashboardOptions {
  clientId?: string;
  range: RangeSelection;
  /**
   * The client roster, already being read by the caller for something else (the
   * Dashboard reads it for its filter dropdown). Passed in so the all-clients
   * comparison REUSES that one read instead of issuing a second read of the same
   * table — the Dashboard's most-hit route otherwise reads `public.clients` twice.
   *
   * ⚠️ A PROMISE, NOT A VALUE, so the caller can hand in the read still in flight
   * and it overlaps the posts read here rather than serialising ahead of it. Omit it
   * and this falls back to its own `listClientRegistry()`, so every other caller
   * and test is unaffected. `null` (a resolved failed read) is honoured as failed
   * — the comparison goes unavailable rather than silently re-reading.
   */
  registry?: Promise<{ id: string; name: string }[] | null>;
}

// ── pure helpers ──────────────────────────────────────────────────────────────

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * The rounded arithmetic mean, or 0 for an empty set — the report's weekday chart
 * idiom, reused so the two surfaces average a weekday the same way. An empty
 * weekday is a genuine 0 here (nothing was posted), never a stand-in for unknown.
 */
function mean(values: number[]): number {
  return values.length === 0 ? 0 : round1(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * The RESOLVED publish date, or null. DISPLAY ONLY — never use this to decide
 * whether a post falls in a window; use `effectiveMs` for that.
 *
 * ⚠️ EXPORTED FOR POSTING CADENCE, AND FOR NOTHING ELSE HERE. Cadence dates a
 * post by when it was PUBLISHED, so a post whose age was scraped in hours (no
 * resolved date) must return null and be omitted from the timeline — never fall
 * back to `scraped_at`, which would drop it onto scrape day and fabricate rhythm.
 * That is exactly the null-returning behaviour this helper has and `effectiveMs`
 * (the windowing helper) deliberately does not. Reused rather than re-copied so
 * the two seams cannot drift on what "the post's date" means.
 */
export function estMs(row: PostMetricsRow): number | null {
  if (!row.estimated_post_date) return null;
  const t = Date.parse(row.estimated_post_date);
  return Number.isNaN(t) ? null : t;
}

/**
 * When a post effectively happened, for WINDOWING and BUCKETING.
 *
 * Posts scraped with a relative age in hours ("23h") carry a NULL
 * estimated_post_date — `src/lib/post-date.ts` resolves day-granularity ages and
 * REFUSES sub-day ones, deliberately (ADR 0010 D5), exactly as the resolver it
 * replaced did. Windowing on estimated_post_date alone
 * therefore dropped yesterday's posts out of every KPI, series bucket, and
 * totalPosts, even though they are the most recent posts the client has.
 *
 * `scraped_at` is the honest stand-in: an hour-age post was, by definition,
 * published within a day of its scrape. It is NOT used for display — the
 * recent-posts list keeps showing `post_age`, because the scrape date is not
 * the date the post was published on.
 */
export function effectiveMs(row: PostMetricsRow): number | null {
  const est = estMs(row);
  if (est !== null) return est;
  const s = row.scraped_at ? Date.parse(row.scraped_at) : NaN;
  return Number.isNaN(s) ? null : s;
}

function recencyMs(row: PostMetricsRow): number {
  return effectiveMs(row) ?? 0;
}

function sumOf(rows: PostMetricsRow[], pick: (r: PostMetricsRow) => number | null): number {
  return rows.reduce((s, r) => s + num(pick(r)), 0);
}

/**
 * A KPI from a current sum vs a prior sum: magnitude %Δ + up/down.
 *
 * ⚠️ `prior === null` MEANS NO PRIOR WINDOW EXISTS, WHICH IS NOT `prior === 0`.
 * All-time has nothing before it to compare against, so the delta is absent and
 * the render site draws no chip. A prior window that EXISTS and happens to sum
 * to zero is a real comparison and keeps its "grew from nothing" 100% exactly as
 * before — the two must never collapse into one branch.
 */
function toKpi(label: string, current: number, prior: number | null): Kpi {
  if (prior === null) return { label, value: current, delta: null, direction: null };

  let delta = 0;
  let direction: "up" | "down" = "up";
  if (prior > 0) {
    const pct = ((current - prior) / prior) * 100;
    delta = Math.abs(Math.round(pct));
    direction = pct >= 0 ? "up" : "down";
  } else if (current > 0) {
    delta = 100; // grew from nothing
    direction = "up";
  }
  return { label, value: current, delta, direction };
}

/**
 * The IMPRESSION-WEIGHTED engagement rate over a SET of posts:
 * `Σinteractions / Σimpressions × 100`. This is the figure on the dashboard.
 *
 * ⚠️ IT CANNOT BE THE MEAN OF THE POSTS' INDIVIDUAL RATES, and must never be
 * rewritten as one. Averaging per-post rates gives a 12-impression post the same
 * say as a 100,000-impression post, which is not what "engagement rate for this
 * period" means to anyone reading it. A set-level rate is a ratio of totals.
 *
 * ⚠️ THIS IS NOT A RIVAL TO THE VIEW'S `calculated_engagement_rate`. That column
 * is the PER-POST rate and is what the posts table shows; this is its AGGREGATE
 * counterpart. They answer different questions and both are correct.
 *
 * What they must SHARE is a numerator and a denominator. The Data Quality panel
 * now checks exactly that — see `aggregateFormulaMatches` in
 * `@/services/data-quality` — because if the view defines its per-post rate over
 * some other basis, this aggregate and that column would be quietly measuring
 * two different things under one word.
 */
function weightedRate(rows: PostMetricsRow[]): number {
  const impressions = sumOf(rows, (r) => r.impressions);
  return impressions > 0 ? (sumOf(rows, (r) => r.interactions) / impressions) * 100 : 0;
}

function snippet(content: string | null): string {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 90).trimEnd()}…` : text;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * The last-sync instant, as `2026-07-16 06:00 UTC`.
 *
 * ⚠️ THE ZONE IS PART OF THE MEASUREMENT. `toISOString` means this figure has
 * always BEEN UTC; it simply never said so, and "last sync 2026-07-16 06:00"
 * reads as local time to everyone who sees it — wrong by 5½ hours for a reviewer
 * in India, by 8 for an operator in Manila, with nothing on screen to reveal it.
 * The instant is unchanged; only the label is new.
 *
 * ⚠️ FORMATTED HERE, IN THE SERVICE, so this string IS `DashboardAnalytics
 * .lastSync` — `page.tsx` prints it as given. A caller wanting a different
 * rendering would need the raw millisecond value, which this seam does not
 * currently publish.
 */
function formatSync(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// ── the aggregation (pure, deterministic given `now`) ────────────────────────

/**
 * The posts the dashboard is ABOUT: inside the selected range, and datable.
 *
 * ⚠️ EXPORTED SO THERE IS EXACTLY ONE DEFINITION OF "THE WINDOW". `totalPosts` is
 * this set's length and the client comparison partitions this same set, so the
 * table and the KPI cards above it agree BY CONSTRUCTION rather than by two
 * filters being kept in step by hand. A second copy is how the count above a
 * table comes to disagree with the rows in it.
 */
export function currentWindow(
  rows: PostMetricsRow[],
  { range, now }: { range: RangeSelection; now: Date },
): PostMetricsRow[] {
  // `startMs` is -Infinity for all time, which needs no special case here: every
  // datable row is `>= -Infinity`. `endMs` is INCLUSIVE.
  const { startMs, endMs } = resolveWindow(range, now);
  return rows.filter((r) => {
    const t = effectiveMs(r);
    return t !== null && t >= startMs && t <= endMs;
  });
}

export function buildDashboardAnalytics(
  rows: PostMetricsRow[],
  { range, now }: { range: RangeSelection; now: Date },
): DashboardAnalytics {
  const nowMs = now.getTime();
  const { startMs, spanDays, priorStartMs, priorEndMs } = resolveWindow(range, now);

  const current = currentWindow(rows, { range, now });

  /**
   * The baseline set, or `null` when there is NO COMPARABLE PRIOR WINDOW.
   *
   * ⚠️ NULL AND EMPTY-ARRAY ARE DIFFERENT ANSWERS HERE. `[]` is a prior window
   * that exists and held no posts — a real comparison, which `toKpi` reads as
   * "grew from nothing". `null` is all-time, which has nothing before it at all.
   * Collapsing the two would print "▲ 100%" on every all-time KPI.
   */
  const prior =
    priorStartMs === null || priorEndMs === null
      ? null
      : rows.filter((r) => {
          const t = effectiveMs(r);
          // Half-open at the top, so the two windows partition without overlap:
          // `priorEndMs` IS `startMs`, not the millisecond before it.
          return t !== null && t >= priorStartMs && t < priorEndMs;
        });

  /** Sum a column over the baseline, or `null` when there is no baseline. */
  const priorSum = (pick: (r: PostMetricsRow) => number | null): number | null =>
    prior === null ? null : sumOf(prior, pick);

  const empty = current.length === 0;

  const hero = toKpi(
    "Impressions",
    sumOf(current, (r) => r.impressions),
    priorSum((r) => r.impressions),
  );
  const kpis: Kpi[] = [
    // Publishing VOLUME leads the row: it is the number of posts the engagement
    // outputs below were earned on. A count, not a sum — `toKpi` takes two numbers
    // and carries the same vs-prior delta every other KPI does. `current.length`
    // is `totalPosts` by construction, so the KPI and the header caption agree.
    toKpi("Posts", current.length, prior === null ? null : prior.length),
    toKpi(
      "Likes",
      sumOf(current, (r) => r.likes),
      priorSum((r) => r.likes),
    ),
    toKpi(
      "Comments",
      sumOf(current, (r) => r.comments),
      priorSum((r) => r.comments),
    ),
    toKpi(
      // `reposts` in the view; ALWAYS "Shares" to staff. This KPI was the lone
      // violator of that rule — the report and the posts table already said
      // "Shares", so a user moving between screens met the same column under two
      // names and had no way to know it was one metric.
      "Shares",
      sumOf(current, (r) => r.reposts),
      priorSum((r) => r.reposts),
    ),
    toKpi(
      "Saves",
      sumOf(current, (r) => r.saves),
      priorSum((r) => r.saves),
    ),
  ];

  const currentRate = weightedRate(current);
  const engagement = {
    value: round1(currentRate),
    // Null for the same reason every KPI delta is: a "+0pt" chip against a
    // period that does not exist reads as "unchanged", which is a claim.
    delta: prior === null ? null : round1(currentRate - weightedRate(prior)),
  };

  // ── the series ─────────────────────────────────────────────────────────────
  //
  // ⚠️ ALL TIME HAS NO SPAN OF ITS OWN, AND `bucketPlan` THROWS ON THE INFINITY
  // IT REPORTS. That throw is deliberate (date-range.ts): an infinite bucket
  // count is not a drawable answer, and inventing a finite one would be a
  // fabricated axis. So all-time measures the span the DATA actually covers —
  // its earliest post through `now` — and buckets that. With no posts there is
  // no span at all, and the honest series is EMPTY: a zero-height bar over an
  // invented date range would assert a period was observed and found silent.
  const earliestMs = current.length > 0 ? Math.min(...current.map((r) => effectiveMs(r)!)) : null;
  const seriesStart = Number.isFinite(startMs) ? startMs : earliestMs;
  const seriesSpanDays = Number.isFinite(spanDays)
    ? spanDays
    : earliestMs === null
      ? null
      : // Both endpoints count, and a window that opened today is still one day.
        Math.max(1, Math.ceil((nowMs - earliestMs) / DAY_MS));

  let impressionsSeries: SeriesPoint[] = [];
  let engagementSeries: SeriesPoint[] = [];

  if (seriesStart !== null && seriesSpanDays !== null) {
    const plan = bucketPlan(seriesSpanDays);
    const impr = new Array<number>(plan.count).fill(0);
    const inter = new Array<number>(plan.count).fill(0);
    for (const r of current) {
      // Non-null by construction: `current` is filtered on effectiveMs !== null.
      const t = effectiveMs(r)!;
      const idx = Math.min(
        plan.count - 1,
        Math.max(0, Math.floor((t - seriesStart) / plan.widthMs)),
      );
      impr[idx]! += num(r.impressions);
      inter[idx]! += num(r.interactions);
    }
    // Labelled by the DAY a bucket opens, from `bucketLabel` — never "Wk N",
    // which cannot name an arbitrary window, and never a weekday name, which
    // repeats after seven bars.
    const labelAt = (i: number) => bucketLabel(plan.unit, seriesStart + i * plan.widthMs);
    impressionsSeries = impr.map((v, i) => ({ label: labelAt(i), value: Math.round(v) }));
    engagementSeries = inter.map((v, i) => ({
      label: labelAt(i),
      value: impr[i]! > 0 ? round1((v / impr[i]!) * 100) : 0,
    }));
  }

  // Recent posts: newest first by estimated_post_date (fallback scraped_at).
  const recentPosts: RecentPost[] = empty
    ? []
    : [...rows]
        .sort((a, b) => recencyMs(b) - recencyMs(a))
        .slice(0, 6)
        .map((r) => ({
          id: r.linkedin_post_id,
          snippet: snippet(r.post_content),
          date: r.estimated_post_date
            ? formatShortDate(r.estimated_post_date)
            : (r.post_age ?? "—"),
          impressions: num(r.impressions),
          likes: num(r.likes),
          comments: num(r.comments),
        }));

  // Average impressions by the weekday a post was PUBLISHED on, over the current
  // window.
  //
  // ⚠️ DATED BY `estMs` (estimated_post_date) ALONE — NOT `effectiveMs`. Every
  // other figure here windows on `effectiveMs`, which stands `scraped_at` in for an
  // hour-age post's missing date; that is right for "is it in the window", but a
  // weekday may NOT be asserted that way. Every post in one weekly scrape shares a
  // `scraped_at`, so bucketing undated posts by it would pile a scrape onto a single
  // weekday and fabricate a rhythm — "which weekday lands best" becoming "which
  // weekday we scraped". Undated posts are excluded and counted separately so the
  // chart can disclose the gap. (The report's weekday chart now applies this same
  // `estMs`-only dating and `weekdayUndatedPosts` count — see `client-report.ts`.)
  const weekdayBuckets: number[][] = Array.from({ length: 7 }, () => []);
  let weekdayUndatedPosts = 0;
  for (const r of current) {
    const t = estMs(r);
    if (t === null) {
      weekdayUndatedPosts += 1;
      continue;
    }
    weekdayBuckets[new Date(t).getUTCDay()]!.push(num(r.impressions));
  }
  const impressionsByWeekday: SeriesPoint[] = WEEKDAYS.map((label, i) => ({
    label,
    value: mean(weekdayBuckets[i]!),
  }));

  const scrapedTimes = rows
    .map((r) => (r.scraped_at ? Date.parse(r.scraped_at) : NaN))
    .filter((t) => !Number.isNaN(t));
  const lastSync = scrapedTimes.length > 0 ? formatSync(Math.max(...scrapedTimes)) : "—";

  return {
    totalPosts: current.length,
    lastSync,
    hero,
    kpis,
    engagement,
    impressionsSeries,
    engagementSeries,
    impressionsByWeekday,
    weekdayUndatedPosts,
    recentPosts,
  };
}

// ── the cross-client comparison (pure) ───────────────────────────────────────

/**
 * A median over the Clients that HAVE the figure, plus how many those were.
 *
 * ⚠️ NULLS ARE EXCLUDED, NOT COERCED. Folding a Client with no followers in as a
 * 0 would drag every median toward zero and quietly redefine it as "median
 * across the book" when it is "median among those we can measure".
 */
function medianOf(
  rows: ClientComparisonRow[],
  pick: (r: ClientComparisonRow) => number | null,
): ComparisonMedian {
  const values = rows.map(pick).filter((v): v is number => v !== null);
  return { value: median(values), clients: values.length };
}

/**
 * The newest recorded value of ONE per-Upload count, per Client.
 *
 * Uploads that recorded NO count are skipped rather than read as zero — the same
 * rule `follower-trend.ts` establishes, so the dashboard and the Client detail
 * page cannot disagree about a Client's figures.
 *
 * ⚠️ THE `pick` IS THE ONLY DIFFERENCE BETWEEN FOLLOWERS AND CONNECTIONS, and
 * they never substitute for each other: a Client with a follower history and no
 * connection counts gets no connections entry at all.
 */
function latestCountByClient(
  uploads: Upload[] | null,
  pick: (upload: Upload) => number | null,
): Map<string, number> {
  const newest = new Map<string, { at: number; count: number }>();
  // A failed upload read (`null`) is an EMPTY history, not an error: every
  // Client's figure is then unknown and the per-row gate below em-dashes it.
  // Distinct from "read ok, nobody recorded a count" only via the
  // `followersUnavailable`/`connectionsUnavailable` flags the caller sets — the
  // numbers are identical.
  for (const u of uploads ?? []) {
    const count = pick(u);
    if (count == null) continue;
    const at = Date.parse(u.createdAt);
    if (Number.isNaN(at)) continue;
    const prev = newest.get(u.clientId);
    if (!prev || at > prev.at) newest.set(u.clientId, { at, count });
  }
  return new Map([...newest].map(([id, v]) => [id, v.count]));
}

/**
 * Interactions per 1,000 of an audience count.
 *
 * ⚠️ THREE WAYS THIS IS NOT APPLICABLE, AND NONE OF THEM IS A ZERO:
 *   • no posts    — nothing was measured; a 0 would rank a silent Client bottom
 *                   of a normalised column for a reading never taken
 *   • no audience — the denominator is unknown
 *   • zero audience — a rate per nothing is undefined, not infinite
 * A Client who DID post and genuinely earned nothing keeps its measured 0.
 */
function perThousand(
  interactions: number,
  audience: number | null,
  postCount: number,
): number | null {
  if (postCount === 0 || audience === null || audience === 0) return null;
  return round1((interactions / audience) * 1000);
}

/**
 * Every Client side by side over one window.
 *
 * ⚠️ `current` MUST BE THE SET `buildDashboardAnalytics` REPORTS AS `totalPosts`
 * — both come from `currentWindow`. That is what makes the parity gate
 * (`Σposts + unattributedPosts === totalPosts`) hold by construction rather than
 * by coincidence.
 *
 * ⚠️ NO PERCENTILES, RANKS OR PERFORMANCE LABELS. ArcBase tracks dozens of
 * Clients; against a book that size a percentile is a rank wearing a lab coat
 * and a label is a judgement the data cannot support. The `posts` column IS the
 * sample size, and the table plus a median is honest at any N.
 */
export function buildClientComparison(
  current: PostMetricsRow[],
  registry: { id: string; name: string }[],
  uploads: Upload[] | null,
): ClientComparison {
  const registered = new Set(registry.map((c) => c.id));
  const byClient = new Map<string, PostMetricsRow[]>();
  let unattributedPosts = 0;

  for (const row of current) {
    // ⚠️ A post attributed to nobody in the roster is COUNTED, not dropped.
    // Attribution is downstream (ADR 0009), so this is expected — and it is the
    // term that lets the table be reconciled against the post count above it.
    if (!row.client_id || !registered.has(row.client_id)) {
      unattributedPosts += 1;
      continue;
    }
    const bucket = byClient.get(row.client_id);
    if (bucket) bucket.push(row);
    else byClient.set(row.client_id, [row]);
  }

  const followersByClient = latestCountByClient(uploads, (u) => u.followerCount);
  const connectionsByClient = latestCountByClient(uploads, (u) => u.connectionsCount);

  const rows: ClientComparisonRow[] = registry.map((client) => {
    // A Client with no posts still gets a row: publishing nothing is a finding,
    // and dropping the row would make the book look smaller and better than it is.
    const posts = byClient.get(client.id) ?? [];
    const impressions = sumOf(posts, (r) => r.impressions);
    const interactions = sumOf(posts, (r) => r.interactions);
    const followers = followersByClient.get(client.id) ?? null;
    // ⚠️ ITS OWN LOOKUP, NEVER A FALLBACK TO `followers`. Borrowing the follower
    // figure would fill the column with numbers that look entirely plausible and
    // are entirely wrong, with nothing on screen to reveal it.
    const connections = connectionsByClient.get(client.id) ?? null;

    return {
      clientId: client.id,
      clientName: client.name,
      posts: posts.length,
      avgImpressions: posts.length === 0 ? null : round1(impressions / posts.length),
      // THE ONE definition, reused. Gated on impressions so a Client nobody saw
      // reads as "not applicable" rather than as a measured 0% engagement.
      engagementRate: impressions > 0 ? round1(weightedRate(posts)) : null,
      followers,
      interactionsPer1K: perThousand(interactions, followers, posts.length),
      // ⚠️ A RAW COUNT, WITH NO DERIVED RATE BESIDE IT. Connections deliberately
      // carries no per-1,000 figure — the asymmetry with followers is intended,
      // not an omission to be tidied up later.
      connections,
    };
  });

  return {
    rows,
    medians: {
      avgImpressions: medianOf(rows, (r) => r.avgImpressions),
      engagementRate: medianOf(rows, (r) => r.engagementRate),
      followers: medianOf(rows, (r) => r.followers),
      interactionsPer1K: medianOf(rows, (r) => r.interactionsPer1K),
      connections: medianOf(rows, (r) => r.connections),
    },
    unattributedPosts,
    unavailable: false,
    // The follower columns are real only if the upload read returned something to
    // read. `null` there means the read failed — the rows already em-dash both
    // follower columns, and this tells the table WHY.
    followersUnavailable: uploads === null,
    // Same read, its own flag: the connections column is blank for most Clients
    // by design, so the table needs to be able to say "outage" about it
    // separately rather than treating an ordinary gap as one.
    connectionsUnavailable: uploads === null,
  };
}

/** The comparison when the ROSTER could not be read — distinct from an empty book. */
const COMPARISON_UNAVAILABLE: ClientComparison = {
  rows: [],
  medians: {
    avgImpressions: { value: null, clients: 0 },
    engagementRate: { value: null, clients: 0 },
    followers: { value: null, clients: 0 },
    interactionsPer1K: { value: null, clients: 0 },
    connections: { value: null, clients: 0 },
  },
  unattributedPosts: 0,
  unavailable: true,
  // Moot here — the whole comparison is unavailable, so there is no follower or
  // connection column to qualify. Kept explicit so the type is satisfied without
  // a cast.
  followersUnavailable: false,
  connectionsUnavailable: false,
};

const SELECT_COLUMNS =
  "client_id, linkedin_post_id, post_content, post_age, estimated_post_date, impressions, likes, comments, reposts, saves, interactions, scraped_at";

/**
 * ⚠️ USER-FACING, NOT A COMMENT. `readAllPages` prints this as the human noun in
 * its truncation and failure warnings, so it must name the source ArcBase
 * actually reads. It said `bi.linkedin_post_latest` until ADR 0010 moved the
 * reads onto the app-owned view; leaving it would have named a source this file
 * no longer touches.
 */
const POSTS_LABEL = "client_posts";

/**
 * One page of the dashboard's window, built per request.
 *
 * ⚠️ THIS READ WAS THE THIRD REAPPEARANCE of the defect `paged.ts` was extracted
 * to prevent (after `fetchPostCounts` and `latestUploadByClient`). It issued a
 * bare `.select()`, so above PostgREST's 1000-row cap it returned 1000 rows and a
 * 200 — every KPI, the engagement figure, both charts and `lastSync` computed
 * from a subset and presented as totals. It survived the earlier sweeps because
 * `analytics.ts` carries its own column list and its own read path.
 *
 * ⚠️ THE `.order()` IS LOAD-BEARING, NOT TIDINESS. Pages 1..n are issued
 * CONCURRENTLY, so without a total order the database may return a row in two
 * ranges or in neither — a silently WRONG row set rather than a short one.
 * `linkedin_post_id` is the view's per-post identity and is unique, so it totally
 * orders the result.
 *
 * ⚠️ `SELECT_COLUMNS` AND `PostMetricsRow` ARE A PAIR — `asPage` asserts the row type
 * rather than checking it. Edit the two together.
 */
function dashboardPageReader(
  clientId: string | undefined,
  boundIso: string | null,
): PageReader<PostMetricsRow> {
  let supabase: ReturnType<typeof createClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createClient(cookies());
    const base = supabase.from("client_posts").select(SELECT_COLUMNS, opts);
    const scoped = clientId ? base.eq("client_id", clientId) : base;
    // ⚠️ A NULL BOUND IS "NO FLOOR", NOT "A FLOOR AT ZERO". All-time drops the
    // clause entirely rather than passing an epoch or a stringified -Infinity,
    // either of which would be a date this code invented.
    const bounded =
      boundIso === null
        ? scoped
        : // Keeps null-dated hour-age posts so they can still appear in "recent posts".
          scoped.or(`estimated_post_date.gte.${boundIso},estimated_post_date.is.null`);
    return asPage<PostMetricsRow>(
      bounded.order("linkedin_post_id", { ascending: true }).range(from, to),
    );
  };
}

export async function getDashboardAnalytics({
  clientId,
  range,
  registry,
}: DashboardOptions): Promise<DashboardAnalytics> {
  const now = new Date();
  // ⚠️ LOWER BOUND ONLY — NEVER AN UPPER ONE. The floor is the PRIOR window's
  // start, which is the earliest instant any figure on the screen needs; for a
  // preset that is still `now − 2N days`, so this generalises the old rule
  // rather than replacing it. A window that ENDS in the past (only a custom one
  // can) would read nothing at all under the old `now − 2 × span` floor.
  //
  // No upper bound is added, because the `.or(… is.null)` clause deliberately
  // keeps null-dated hour-age posts for `effectiveMs` to window by `scraped_at`,
  // and an upper bound would interact badly with it. Rows past the window's end
  // are filtered in memory by `currentWindow`, which is correct and cheap.
  const { priorStartMs } = resolveWindow(range, now);
  const boundIso = priorStartMs === null ? null : new Date(priorStartMs).toISOString().slice(0, 10);

  const { rows, unavailable, truncated, total } = await readAllPages(
    dashboardPageReader(clientId, boundIso),
    POSTS_LABEL,
  );

  if (unavailable) {
    // Distinct from "no data": flag it so the page can show an "unavailable"
    // panel rather than the "No posts yet" empty state. `readAllPages` has
    // already warned, so this does not warn again.
    return { ...buildDashboardAnalytics([], { range, now }), unavailable: true };
  }

  const analytics = buildDashboardAnalytics(rows, { range, now });

  // ⚠️ ONLY IN THE ALL-CLIENTS STATE, and the two extra reads are not issued
  // otherwise. With one Client selected the screen is about that Client and a
  // comparison is meaningless — fetching a registry and an upload history to
  // throw away would be paying for nothing.
  let comparison: ClientComparison | null = null;
  if (!clientId) {
    // ⚠️ REUSE THE CALLER'S ROSTER READ WHEN IT GAVE US ONE. `registry ??
    // listClientRegistry()` uses the read the Dashboard already issued for its
    // filter, so `public.clients` is read once per request rather than twice; the
    // fallback keeps every other caller and test issuing its own read. `??` on the
    // promise itself, so a passed-in resolved `null` (a failed roster) is honoured
    // as failed below, not swapped for a fresh read.
    const [roster, uploads] = await Promise.all([
      registry ?? listClientRegistry(),
      listAllUploads(),
    ]);
    // ⚠️ BAIL ONLY ON A NULL ROSTER. Without Client names there are no rows to
    // show. A failed UPLOAD read is NOT fatal to the comparison — it feeds only
    // `followers` and `interactionsPer1K`, so it is passed through as `null` and
    // those two columns em-dash for every row while the three post-derived
    // columns stay real. Folding `uploads === null` back in here throws away
    // three readable columns to hide two.
    comparison =
      roster === null
        ? COMPARISON_UNAVAILABLE
        : // THE SAME `currentWindow` CALL `buildDashboardAnalytics` makes, on the
          // same rows — so the table partitions exactly what `totalPosts` counts.
          buildClientComparison(currentWindow(rows, { range, now }), roster, uploads);
  }

  // ⚠️ TRUNCATION IS A DIFFERENT FACT FROM `unavailable` AND MUST NOT COLLAPSE
  // INTO IT. Unavailable means the numbers are meaningless; truncated means they
  // are real but incomplete, so every figure on the screen is a LOWER BOUND and
  // the screen has to say so rather than presenting short numbers as totals.
  //
  // ⚠️ AND THE NUMBERS COME FROM THE PAGER, NOT FROM ANYTHING COUNTED HERE.
  // `rows.length` is what was read and `total` is what matched — the gap between
  // them is exactly what the banner exists to state, and re-deriving either from
  // the aggregated figures would reintroduce the guesswork this removes.
  return {
    ...analytics,
    comparison,
    truncation: truncated ? { read: rows.length, total } : null,
  };
}
