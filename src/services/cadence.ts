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
// ⚠️ THE FOUR FIGURES ARE FOUR DIFFERENT QUESTIONS AND SURVIVE IMPRECISION
// DIFFERENTLY. One blanket rule over all of them would be the wrong shape:
//
//   • A GAP needs both endpoints day-precise AND needs that nothing was published
//     between them. Coarse dates destroy both halves — see `gapsAreKnowable`.
//   • A RATE needs an accurate count and an accurate span, and tolerates per-item
//     noise completely: shuffling the interior dates within the span does not move
//     it. `postsPerWeek` therefore SURVIVES coarse dates and is kept.
//   • A RECENCY depends on exactly ONE post and inherits that post's precision.
//   • The BARS are counts per bucket and are correct at their own granularity.
//
// ⚠️ WITHHELD, NEVER RECOMPUTED ON A FILTERED ARRAY. The obvious repair — drop the
// imprecise posts, recompute the gaps over what is left — is a NEW falsehood, not
// a fix: the surviving gaps then stretch ACROSS the dropped posts, so the figure
// overstates the client's silence. A number that is too small would have been
// swapped for one that is too large. If you find yourself computing gaps over a
// filtered timeline, stop.
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

  // ⚠️ A THIRD TIMELINE, ONE NOTCH FINER AGAIN — for the DAY-level figures. Same
  // rule, same vocabulary, different granularity: `placePost(row, "day")`.
  const dayTimeline = rows
    .map((row) => placePost(row, "day"))
    .filter((p): p is { state: "placed"; ms: number } => p.state === "placed")
    .map((p) => p.ms)
    .sort((a, b) => a - b);
  const dayPlacedPosts = dayTimeline.length;
  // ⚠️ NOT `weeklyCoarsePosts`, AND NOT `undatedPosts`. A week-aged post is placed
  // in a weekly bar and is still too coarse for a day figure, so it counts here
  // and not there; and every post counted here HAS a date.
  const dayCoarsePosts = datedPosts - dayPlacedPosts;

  // Whether the most RECENT dated post is itself known to the day.
  //
  // ⚠️ COMPARING THE TWO MAXIMA IS SOUND BECAUSE EVERY COARSE RESOLUTION IS BIASED
  // LATE. A month age snaps to the 1st of a later month than the post can be, a
  // week age resolves to the scrape's weekday (LinkedIn's "3w" means 21–27 days),
  // a year age to the same day-of-month ("1y" means 12–23 months). In every case
  // the stored instant is at or after the true one, so a coarse post can never
  // truly post-date a day-precise post that shares or exceeds its instant.
  const lastPostDateIsExact =
    dayPlacedPosts > 0 && dayTimeline[dayPlacedPosts - 1] === timeline[datedPosts - 1];

  const empty: PostingCadence = {
    totalPosts,
    datedPosts,
    undatedPosts,
    weeklyPlacedPosts,
    weeklyCoarsePosts,
    dayPlacedPosts,
    dayCoarsePosts,
    lastPostDateIsExact,
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

  // ⚠️ A RECENCY INHERITS EXACTLY ONE POST'S PRECISION — the last one's, and no
  // other post's. A history full of month-aged posts does not stop us answering
  // "when did they last post" if the last post itself is day-aged; and a single
  // month-aged last post makes the answer unknowable however precise the rest is.
  // A blanket "any coarse post → null" rule would be wrong in both directions.
  //
  // Floored to whole elapsed days: "15 days since" reads as 15 complete days.
  const daysSinceLastPost = lastPostDateIsExact
    ? Math.floor((now.getTime() - lastMs) / DAY_MS)
    : null;

  // ⚠️ A GAP NEEDS TWO POSTS. With one dated post there is no gap and no rate —
  // that is the NOT-APPLICABLE state, never a fabricated gap of zero.
  if (datedPosts < 2) return { ...empty, daysSinceLastPost };

  // ⚠️ WHEN A GAP IS A REAL SILENCE, AND WHEN IT IS ONLY ARITHMETIC. Two
  // conditions, and both are necessary:
  //
  //   • EVERY dated post is known to the DAY. A day-count between two instants
  //     that are themselves month-snapped is arithmetic on artifacts. Worse than
  //     imprecise: `snapToMonthStart` puts every post in a month on the SAME
  //     instant, so their gap is exactly 0 and the median collapses toward zero —
  //     reporting "0 days between posts" for a client who posts monthly.
  //   • NOTHING was omitted. An undated post is a post we know happened and
  //     cannot place, so it may sit inside any gap. "Nothing was published
  //     between these two" is then unknown, not true.
  //
  // ⚠️ FAILING EITHER MEANS WITHHOLD, NEVER RECOMPUTE ON WHAT IS LEFT — see the
  // note at the top of this file.
  const gapsAreKnowable = dayCoarsePosts === 0 && undatedPosts === 0;

  // N−1 gaps in days. `longestGap` is accumulated in this pass rather than via
  // `Math.max(...gaps)`, which spreads every gap into one call and throws
  // RangeError past the engine's argument limit — a hard crash on a client with
  // a very long history, exactly as the report's month-span walk avoids.
  const gaps: number[] = [];
  let longestGap = 0;
  if (gapsAreKnowable) {
    for (let i = 1; i < datedPosts; i += 1) {
      const gap = (timeline[i]! - timeline[i - 1]!) / DAY_MS;
      gaps.push(gap);
      if (gap > longestGap) longestGap = gap;
    }
  }

  // ⚠️ THE RATE IS KEPT OVER COARSE DATES, DELIBERATELY, and this is the one place
  // the four figures visibly part company. Its numerator is a COUNT of real posts
  // and carries no date error at all; its denominator is ONE span, so only the two
  // endpoints carry error and every interior date cancels out. Over the live
  // history — hundreds of days — an endpoint uncertain by up to a month is a small
  // relative error, and the figure stays informative. Deleting it alongside the
  // gaps would be the reflexive move and would throw away a number the data
  // supports. See `docs/specs/2026-08-19-analytics-ownership-execution.md`.
  //
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
    // NULL is NOT-COMPUTABLE-FROM-THIS-DATA, which is a fourth state alongside
    // absent, zero and unreadable. A gap of 0 days is a real measurement (two
    // posts on one day) and is still reported when the dates can carry it.
    medianGapDays: gapsAreKnowable ? round1(median(gaps)!) : null,
    longestGapDays: gapsAreKnowable ? round1(longestGap) : null,
    daysSinceLastPost,
  };
}
