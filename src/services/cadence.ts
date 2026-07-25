import { median } from "@/lib/median";
import { estMs, type BiPostRow } from "@/services/analytics";
import type { PostingCadence } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Posting cadence: how regularly a Client posts, over their ALL-TIME history.
//
// A pure function over the SAME rows `client-report.ts` already read — no new
// query — computed alongside the report and hung on `ClientReport`, exactly as
// `reconcileRates(rows)` is.
//
// ⚠️ DATED BY `estimated_post_date` ALONE (via the exported `estMs`). A post
// scraped at hour-granularity has no resolved date; the windowing helper
// `effectiveMs` would fall back to `scraped_at` and drop every such post onto the
// single scrape instant, manufacturing same-day clusters and reporting a client
// as more regular than they are. Cadence must not. The undated post is COUNTED in
// the total and OMITTED from the timeline and every gap — and that omission is
// disclosed in plain language by the component.
//
// ⚠️ IT REPORTS RHYTHM; IT NEVER SCORES IT. No consistency index, no coefficient
// of variation, no "fairly regular" label. On a handful of posts such a number is
// noise wearing a lab coat. The gaps ARE the finding, and the timeline lets the
// reader judge regularity themselves against a visible N.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** One decimal, matching the rest of the report's figures. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function buildCadence(rows: BiPostRow[], now: Date): PostingCadence {
  const totalPosts = rows.length;

  // Dated by the PUBLISH date alone. `estMs` returns null for an hour-age post,
  // which is how those posts are counted-but-not-placed.
  const timeline = rows
    .map((row) => estMs(row))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  const datedPosts = timeline.length;
  const undatedPosts = totalPosts - datedPosts;

  const empty: PostingCadence = {
    totalPosts,
    datedPosts,
    undatedPosts,
    postsPerWeek: null,
    medianGapDays: null,
    longestGapDays: null,
    daysSinceLastPost: null,
    timeline,
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
