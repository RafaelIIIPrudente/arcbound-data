import { median } from "@/lib/median";
import { estMs, placePost, type PostMetricsRow } from "@/services/analytics";
import type { CadenceBucket, PostingCadence } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Posting cadence: how regularly a Client posts. A pure function over whatever
// rows the caller passes — `client-report.ts` hands it the SELECTED-period rows,
// so the section follows the report's period picker — computed alongside the
// report from rows already read (no new query), exactly as `reconcileRates(rows)`.
//
// ⚠️ DATED BY `estimated_post_date` ALONE (via the exported `estMs`). A post
// scraped at hour-granularity has no resolved date; the windowing helper
// `effectiveMs` would fall back to `scraped_at` and drop every such post onto the
// single scrape instant, manufacturing same-day clusters and reporting a client
// as more regular than they are. Cadence must not. The undated post is COUNTED in
// the total and OMITTED from the timeline and every gap — and that omission is
// disclosed in plain language by the component.
//
// ⚠️ AND A DATE IS NOT AUTOMATICALLY PRECISE ENOUGH FOR EVERY BUCKET. A month-aged
// post resolves to the 1st, so it carries a real MONTH and a manufactured week. The
// WEEKLY bars therefore admit only posts dated to the week or finer, and the ones
// held out are counted in `weeklyCoarsePosts` and disclosed by the component —
// never merged into `undatedPosts`, which says something different and false.
// The MONTHLY bars and the marks keep every dated post: narrowing them would throw
// away a reading that is genuinely month-precise.
//
// ⚠️ IT REPORTS RHYTHM; IT NEVER SCORES IT. No consistency index, no coefficient
// of variation, no "fairly regular" label. On a handful of posts such a number is
// noise wearing a lab coat. The gaps ARE the finding, and the timeline lets the
// reader judge regularity themselves against a visible N.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
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

/** One decimal, matching the rest of the report's figures. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Midnight UTC of the MONDAY of the week `ms` falls in. */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const mondayOffset = (d.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0, …
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - mondayOffset * DAY_MS;
}

/**
 * WEEK-PRECISION posts per calendar week, first→last, empty weeks kept as a `0`.
 *
 * ⚠️ THE `0` MEANS "NONE OF THESE POSTS", NOT "NO POSTS". It used to say the
 * latter, and that sentence has gone false: the caller now passes only posts dated
 * to the week or finer, so a week whose only post was month-aged reads `0` here
 * while the post is real and counted in `weeklyCoarsePosts`. It is still a
 * MEASURED zero over the basis the bar is drawn from — unlike the impressions
 * charts, where an empty month is a gap (`null`) because "posted and got no reach"
 * is a different claim — but the basis is narrower than every dated post, and the
 * component has to say so or the quiet stretch reads as a finding it is not.
 */
function postsByWeek(timeline: number[]): CadenceBucket[] {
  if (timeline.length === 0) return [];
  const counts = new Map<number, number>();
  for (const ms of timeline) {
    const ws = weekStartMs(ms);
    counts.set(ws, (counts.get(ws) ?? 0) + 1);
  }
  // Week starts are Mondays at UTC midnight, so stepping by exactly 7 days lands
  // on each following Monday with no drift.
  const out: CadenceBucket[] = [];
  const last = weekStartMs(timeline[timeline.length - 1]!);
  for (let ws = weekStartMs(timeline[0]!); ws <= last; ws += WEEK_MS) {
    const d = new Date(ws);
    out.push({
      label: `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`,
      count: counts.get(ws) ?? 0,
    });
  }
  return out;
}

/**
 * Dated posts per calendar MONTH, first→last, empty months kept as a real `0`.
 *
 * ⚠️ EVERY DATED POST, WHATEVER ITS PRECISION — unlike `postsByWeek`. A month-aged
 * post is month-precise, so this is exactly the granularity it can support;
 * holding it out here would discard a real reading to match a narrower chart.
 */
function postsByMonth(timeline: number[]): CadenceBucket[] {
  if (timeline.length === 0) return [];
  const counts = new Map<string, number>();
  for (const ms of timeline) {
    const d = new Date(ms);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const start = new Date(timeline[0]!);
  const end = new Date(timeline[timeline.length - 1]!);
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const out: CadenceBucket[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    out.push({
      label: `${SHORT_MONTHS[m]} ${String(y).slice(2)}`,
      count: counts.get(`${y}-${m}`) ?? 0,
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export function buildCadence(rows: PostMetricsRow[], now: Date): PostingCadence {
  const totalPosts = rows.length;

  // Dated by the PUBLISH date alone. `estMs` returns null for an hour-age post,
  // which is how those posts are counted-but-not-placed.
  const timeline = rows
    .map((row) => estMs(row))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  const datedPosts = timeline.length;
  const undatedPosts = totalPosts - datedPosts;

  // ⚠️ A SECOND, NARROWER TIMELINE — for the weekly bars alone. A month-aged post
  // is dated (it is on the marks and in a monthly bar) and still cannot say which
  // WEEK it went out in: its date was snapped to the 1st, so the week it lands in
  // is whichever week that 1st fell in. `placePost(row, "week")` is the same rule
  // the weekday charts apply one notch finer.
  const weekTimeline = rows
    .map((row) => placePost(row, "week"))
    .filter((p): p is { state: "placed"; ms: number } => p.state === "placed")
    .map((p) => p.ms)
    .sort((a, b) => a - b);
  const weeklyPlacedPosts = weekTimeline.length;
  // Dated, but too coarse for a weekly bar. ⚠️ NOT added to `undatedPosts`: these
  // posts have a date, and telling the reader otherwise sends them looking for
  // missing data that is not missing.
  const weeklyCoarsePosts = datedPosts - weeklyPlacedPosts;

  const empty: PostingCadence = {
    totalPosts,
    datedPosts,
    undatedPosts,
    weeklyPlacedPosts,
    weeklyCoarsePosts,
    postsPerWeek: null,
    medianGapDays: null,
    longestGapDays: null,
    daysSinceLastPost: null,
    timeline,
    // Independent of the gap logic below — derived purely from the dated posts —
    // so they belong here and hold for every state (empty for a bare timeline).
    weekly: postsByWeek(weekTimeline),
    monthly: postsByMonth(timeline),
  };

  // No dated post → no last post to measure from, and nothing temporal exists.
  if (datedPosts === 0) return empty;

  const firstMs = timeline[0]!;
  const lastMs = timeline[datedPosts - 1]!;

  // Defined for a SINGLE dated post — "are they active now?" needs only the last
  // one. Floored to whole elapsed days: "15 days since" reads as 15 complete days.
  const daysSinceLastPost = Math.floor((now.getTime() - lastMs) / DAY_MS);

  // ⚠️ A GAP NEEDS TWO POSTS. With one dated post there is no gap and no rate —
  // that is the NOT-APPLICABLE state, never a fabricated gap of zero.
  if (datedPosts < 2) return { ...empty, daysSinceLastPost };

  // N−1 gaps in days. `longestGap` is accumulated in this pass rather than via
  // `Math.max(...gaps)`, which spreads every gap into one call and throws
  // RangeError past the engine's argument limit — a hard crash on a client with
  // a very long history, exactly as the report's month-span walk avoids.
  const gaps: number[] = [];
  let longestGap = 0;
  for (let i = 1; i < datedPosts; i += 1) {
    const gap = (timeline[i]! - timeline[i - 1]!) / DAY_MS;
    gaps.push(gap);
    if (gap > longestGap) longestGap = gap;
  }

  // Over the ACTIVE SPAN (first → last dated post), not up to `now`. A client who
  // posted steadily then stopped reads as their rhythm WHILE active; the silence
  // since is carried by `daysSinceLastPost`, not baked into the rate.
  //
  // ⚠️ A ZERO-LENGTH SPAN HAS NO RATE. Every dated post on one day → span 0 → the
  // weekly rate is undefined (not Infinity, and not zero): the NOT-APPLICABLE
  // state. The gaps above are still a MEASURED zero — a genuinely different fact.
  const activeSpanDays = (lastMs - firstMs) / DAY_MS;
  const postsPerWeek = activeSpanDays > 0 ? round1(datedPosts / (activeSpanDays / 7)) : null;

  return {
    ...empty,
    postsPerWeek,
    // `median` sorts a copy; the gaps are day-granularity so these round to whole
    // days, but round1 keeps the type honest if a resolved date ever carries time.
    medianGapDays: round1(median(gaps)!),
    longestGapDays: round1(longestGap),
    daysSinceLastPost,
  };
}
