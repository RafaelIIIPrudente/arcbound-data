import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type {
  DashboardAnalytics,
  DashboardRange,
  Kpi,
  RecentPost,
  SeriesPoint,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Service Seam (dashboard read-model), now LIVE. Reads the externally-
// owned BI view `bi.linkedin_post_latest` (one row per client-matched post, latest
// scrape) and aggregates it into DashboardAnalytics. The signature is unchanged
// (ADR 0009). The pure `buildDashboardAnalytics` does all aggregation so it is
// deterministically unit-testable with an injected `now`.
// ─────────────────────────────────────────────────────────────────────────────

/** A row of the externally-owned view bi.linkedin_post_latest. */
export interface BiPostRow {
  client_id: string;
  client_name: string | null;
  linkedin_post_id: string;
  post_url: string | null;
  post_content: string | null;
  /** Raw relative age, e.g. "23h"/"4d". */
  post_age: string | null;
  /** Resolved date (NULL for hour-age posts — Shay's resolver skips those). */
  estimated_post_date: string | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  saves: number | null;
  interactions: number | null;
  provided_engagement_rate: number | null;
  calculated_engagement_rate: number | null;
  scraped_at: string | null;
  uploaded_at: string | null;
}

/** Human label for the "vs. prior …" copy and the chart caption. */
export const RANGE_LABEL: Record<DashboardRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

const RANGE_DAYS: Record<DashboardRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
// Series buckets per range: daily / weekly / monthly (approximate).
const RANGE_BUCKETS: Record<DashboardRange, number> = { "7d": 7, "30d": 5, "90d": 3 };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

export interface DashboardOptions {
  clientId?: string;
  range: DashboardRange;
}

// ── pure helpers ──────────────────────────────────────────────────────────────

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * The RESOLVED publish date, or null. DISPLAY ONLY — never use this to decide
 * whether a post falls in a window; use `effectiveMs` for that.
 */
function estMs(row: BiPostRow): number | null {
  if (!row.estimated_post_date) return null;
  const t = Date.parse(row.estimated_post_date);
  return Number.isNaN(t) ? null : t;
}

/**
 * When a post effectively happened, for WINDOWING and BUCKETING.
 *
 * Posts scraped with a relative age in hours ("23h") come back from
 * `bi.linkedin_post_latest` with a NULL estimated_post_date — Shay's resolver
 * only resolves day-granularity ages. Windowing on estimated_post_date alone
 * therefore dropped yesterday's posts out of every KPI, series bucket, and
 * totalPosts, even though they are the most recent posts the client has.
 *
 * `scraped_at` is the honest stand-in: an hour-age post was, by definition,
 * published within a day of its scrape. It is NOT used for display — the
 * recent-posts list keeps showing `post_age`, because the scrape date is not
 * the date the post was published on.
 */
export function effectiveMs(row: BiPostRow): number | null {
  const est = estMs(row);
  if (est !== null) return est;
  const s = row.scraped_at ? Date.parse(row.scraped_at) : NaN;
  return Number.isNaN(s) ? null : s;
}

function recencyMs(row: BiPostRow): number {
  return effectiveMs(row) ?? 0;
}

function sumOf(rows: BiPostRow[], pick: (r: BiPostRow) => number | null): number {
  return rows.reduce((s, r) => s + num(pick(r)), 0);
}

/** A KPI from a current sum vs a prior sum: magnitude %Δ + up/down. */
function toKpi(label: string, current: number, prior: number): Kpi {
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
function weightedRate(rows: BiPostRow[]): number {
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

function formatSync(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

// ── the aggregation (pure, deterministic given `now`) ────────────────────────

export function buildDashboardAnalytics(
  rows: BiPostRow[],
  { range, now }: { range: DashboardRange; now: Date },
): DashboardAnalytics {
  const days = RANGE_DAYS[range];
  const nowMs = now.getTime();
  const currentStart = nowMs - days * DAY_MS;
  const priorStart = nowMs - 2 * days * DAY_MS;

  const current = rows.filter((r) => {
    const t = effectiveMs(r);
    return t !== null && t >= currentStart && t <= nowMs;
  });
  const prior = rows.filter((r) => {
    const t = effectiveMs(r);
    return t !== null && t >= priorStart && t < currentStart;
  });

  const empty = current.length === 0;

  const hero = toKpi(
    "Impressions",
    sumOf(current, (r) => r.impressions),
    sumOf(prior, (r) => r.impressions),
  );
  const kpis: Kpi[] = [
    toKpi(
      "Likes",
      sumOf(current, (r) => r.likes),
      sumOf(prior, (r) => r.likes),
    ),
    toKpi(
      "Comments",
      sumOf(current, (r) => r.comments),
      sumOf(prior, (r) => r.comments),
    ),
    toKpi(
      // `reposts` in the view; ALWAYS "Shares" to staff. This KPI was the lone
      // violator of that rule — the report and the posts table already said
      // "Shares", so a user moving between screens met the same column under two
      // names and had no way to know it was one metric.
      "Shares",
      sumOf(current, (r) => r.reposts),
      sumOf(prior, (r) => r.reposts),
    ),
    toKpi(
      "Saves",
      sumOf(current, (r) => r.saves),
      sumOf(prior, (r) => r.saves),
    ),
  ];

  const currentRate = weightedRate(current);
  const engagement = {
    value: round1(currentRate),
    delta: round1(currentRate - weightedRate(prior)),
  };

  // Bucket the current window (impressions summed; engagement = weighted rate).
  const bucketCount = RANGE_BUCKETS[range];
  const spanMs = (days * DAY_MS) / bucketCount;
  const impr = new Array<number>(bucketCount).fill(0);
  const inter = new Array<number>(bucketCount).fill(0);
  for (const r of current) {
    // Non-null by construction: `current` is filtered on effectiveMs !== null.
    const t = effectiveMs(r)!;
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((t - currentStart) / spanMs)));
    impr[idx]! += num(r.impressions);
    inter[idx]! += num(r.interactions);
  }
  const bucketLabel = (i: number): string => {
    const start = new Date(currentStart + i * spanMs);
    if (range === "7d") return WEEKDAYS[start.getUTCDay()]!;
    if (range === "90d") return MONTHS[start.getUTCMonth()]!;
    return `Wk ${i + 1}`;
  };
  const impressionsSeries: SeriesPoint[] = impr.map((v, i) => ({
    label: bucketLabel(i),
    value: Math.round(v),
  }));
  const engagementSeries: SeriesPoint[] = inter.map((v, i) => ({
    label: bucketLabel(i),
    value: impr[i]! > 0 ? round1((v / impr[i]!) * 100) : 0,
  }));

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
    recentPosts,
  };
}

const SELECT_COLUMNS =
  "client_id, linkedin_post_id, post_content, post_age, estimated_post_date, impressions, likes, comments, reposts, saves, interactions, scraped_at";

export async function getDashboardAnalytics({
  clientId,
  range,
}: DashboardOptions): Promise<DashboardAnalytics> {
  const now = new Date();
  // Bound to the largest window needed (current + prior = 2N days), but keep
  // null-dated hour-age posts so they can appear in "recent posts".
  const boundIso = new Date(now.getTime() - 2 * RANGE_DAYS[range] * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const supabase = createClient(cookies());
  let query = supabase.schema("bi").from("linkedin_post_latest").select(SELECT_COLUMNS);
  if (clientId) query = query.eq("client_id", clientId);
  query = query.or(`estimated_post_date.gte.${boundIso},estimated_post_date.is.null`);

  const { data, error } = await query;
  if (error) {
    // Degrade gracefully while `bi` access is still being wired: show the empty
    // dashboard instead of crashing the page. (This temporarily conflates "BI
    // unavailable" with "no data" — both render the "No posts yet" state.)
    console.warn(`Analytics unavailable — bi.linkedin_post_latest read failed: ${error.message}`);
    // Distinct from "no data": flag it so the page can show an "unavailable"
    // panel rather than the "No posts yet" empty state.
    return { ...buildDashboardAnalytics([], { range, now }), unavailable: true };
  }

  return buildDashboardAnalytics((data ?? []) as BiPostRow[], { range, now });
}
