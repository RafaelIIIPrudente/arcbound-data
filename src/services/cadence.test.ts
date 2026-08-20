import { describe, expect, it } from "vitest";

import type { PostMetricsRow } from "./analytics";
import { buildCadence } from "./cadence";

// ─────────────────────────────────────────────────────────────────────────────
// Posting cadence is a PURE function over the client's all-time post rows, dated
// by `estimated_post_date` ALONE. The whole point of the section is that it never
// fabricates rhythm: an undated post is COUNTED but never PLACED, a gap that
// cannot be measured is not-applicable rather than zero, and the rate is measured
// over the active span (first→last dated post) rather than up to today.
// ─────────────────────────────────────────────────────────────────────────────

function row(over: Partial<PostMetricsRow>): PostMetricsRow {
  return {
    client_id: "c1",
    client_name: "Bryan Wish",
    linkedin_post_id: "p",
    post_url: null,
    post_content: "content",
    post_age: null,
    estimated_post_date: null,
    impressions: 0,
    likes: 0,
    comments: 0,
    reposts: 0,
    saves: 0,
    interactions: 0,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: null,
    uploaded_at: null,
    ...over,
  };
}

const DAY_MS = 86_400_000;
const dayMs = (iso: string) => Date.parse(iso);

// Four DATED posts: Jan 1, 3, 5, 25 → gaps of 2, 2, 20 days.
//   • median gap 2 (mean would be 8 — the two must not be confused)
//   • longest gap 20
//   • active span 24 days (Jan 1 → Jan 25)
// NOW is Feb 14 — 20 whole days after the last post, and well past the span, so a
// rate measured "to today" would differ from the active-span rate.
//
// ⚠️ EACH CARRIES A DAY AGE MATCHING ITS DATE. The weekly bars admit only posts
// dated to the week or finer, and precision is read off `post_age` — a row with a
// date and no age states none, and would silently empty the weekly assertions.
const DATED: PostMetricsRow[] = [
  row({
    linkedin_post_id: "a",
    post_age: "1d",
    scraped_at: "2026-01-02T00:00:00.000Z",
    estimated_post_date: "2026-01-01",
  }),
  row({
    linkedin_post_id: "b",
    post_age: "1d",
    scraped_at: "2026-01-04T00:00:00.000Z",
    estimated_post_date: "2026-01-03",
  }),
  row({
    linkedin_post_id: "c",
    post_age: "1d",
    scraped_at: "2026-01-06T00:00:00.000Z",
    estimated_post_date: "2026-01-05",
  }),
  row({
    linkedin_post_id: "d",
    post_age: "1d",
    scraped_at: "2026-01-26T00:00:00.000Z",
    estimated_post_date: "2026-01-25",
  }),
];
const NOW = new Date("2026-02-14T00:00:00.000Z");

describe("buildCadence — the five figures over 2+ dated posts", () => {
  it("counts every post as the N anchor, dated or not", () => {
    const cadence = buildCadence(DATED, NOW);
    expect(cadence.totalPosts).toBe(4);
    expect(cadence.datedPosts).toBe(4);
    expect(cadence.undatedPosts).toBe(0);
  });

  it("takes the MEDIAN gap, not the mean — one hiatus must not inflate it", () => {
    // Gaps 2, 2, 20: median 2, mean 8. A mean would report this client as far
    // less regular than they actually were.
    expect(buildCadence(DATED, NOW).medianGapDays).toBe(2);
  });

  it("reports the longest gap — the 'went quiet' signal", () => {
    expect(buildCadence(DATED, NOW).longestGapDays).toBe(20);
  });

  it("measures posts/week over the ACTIVE SPAN, not up to today", () => {
    // Active span Jan 1 → Jan 25 = 24 days ≈ 3.43 weeks; 4 posts ÷ 3.43 = 1.2.
    // Measured to NOW (Feb 14, 44 days) it would read 0.6 — a client who posted
    // steadily then paused must read as their rhythm WHILE ACTIVE.
    expect(buildCadence(DATED, NOW).postsPerWeek).toBe(1.2);
  });

  it("reports whole days since the last dated post", () => {
    // Jan 25 → Feb 14 is 20 days.
    expect(buildCadence(DATED, NOW).daysSinceLastPost).toBe(20);
  });

  it("places one timeline mark per dated post, ascending, at the resolved date", () => {
    const cadence = buildCadence(DATED, NOW);
    expect(cadence.timeline).toEqual([
      dayMs("2026-01-01"),
      dayMs("2026-01-03"),
      dayMs("2026-01-05"),
      dayMs("2026-01-25"),
    ]);
  });
});

describe("buildCadence — dated by estimated_post_date ALONE", () => {
  // An undated post carries a scrape date; `effectiveMs` would fall back to it
  // and drop the post onto scrape day, fabricating a mark and a gap. Cadence must
  // not: the post is counted in the total and omitted from everything temporal.
  const withUndated: PostMetricsRow[] = [
    ...DATED,
    row({ linkedin_post_id: "ghost", estimated_post_date: null, scraped_at: "2026-06-01" }),
  ];

  it("COUNTS an undated post in the total but places it nowhere", () => {
    const cadence = buildCadence(withUndated, NOW);
    expect(cadence.totalPosts).toBe(5); // counted
    expect(cadence.datedPosts).toBe(4); // but not dated
    expect(cadence.undatedPosts).toBe(1);
    expect(cadence.timeline).toHaveLength(4); // and not on the timeline
  });

  it("never substitutes scraped_at — the undated post is not on the timeline", () => {
    const cadence = buildCadence(withUndated, NOW);
    // The June scrape instant must not appear as a mark — that is the exact
    // fabrication `effectiveMs` would introduce here.
    expect(cadence.timeline).not.toContain(dayMs("2026-06-01"));
  });

  it("omits the undated post from the gaps — the longest gap is unchanged", () => {
    // If the undated post were counted in the gaps (at scrape day, June), the
    // longest gap would jump from 20 to ~127 days. It must stay 20.
    const cadence = buildCadence(withUndated, NOW);
    expect(cadence.longestGapDays).toBe(20);
    expect(cadence.medianGapDays).toBe(2);
  });
});

describe("buildCadence — week and month buckets for the switchable chart", () => {
  it("buckets posts by calendar week (Monday start), 0-filling empty weeks", () => {
    // DATED is Jan 1 (Thu), 3 (Sat), 5 (Mon), 25 (Sun). Weeks from Mon Dec 29:
    //   Dec 29 → Jan 1 & Jan 3 (2)   ·   Jan 5 → Jan 5 (1)
    //   Jan 12 → nothing (0, a real gap)   ·   Jan 19 → Jan 25 (1)
    expect(buildCadence(DATED, NOW).weekly).toEqual([
      { label: "29 Dec", count: 2 },
      { label: "5 Jan", count: 1 },
      { label: "12 Jan", count: 0 }, // a week with no posts is a genuine 0 here
      { label: "19 Jan", count: 1 },
    ]);
  });

  it("buckets posts by calendar month, 0-filling empty months", () => {
    // ⚠️ MONTH AGES ON PURPOSE. The monthly bars admit every dated post whatever
    // its precision — a month-aged post is month-precise, and holding it out here
    // would discard a real reading. Only the WEEKLY bars narrow.
    const spread = [
      row({ linkedin_post_id: "m1", post_age: "3m", estimated_post_date: "2026-05-01" }),
      row({ linkedin_post_id: "m2", post_age: "1m", estimated_post_date: "2026-07-05" }),
      row({ linkedin_post_id: "m3", post_age: "1m", estimated_post_date: "2026-07-25" }),
    ];
    // May → 1, June → 0 (a silent month, shown), July → 2.
    expect(buildCadence(spread, NOW).monthly).toEqual([
      { label: "May 26", count: 1 },
      { label: "Jun 26", count: 0 },
      { label: "Jul 26", count: 2 },
    ]);
  });

  it("every bucket sums back to its own basis — nothing is lost or invented", () => {
    // ⚠️ TWO DIFFERENT BASES, DELIBERATELY. Monthly counts every dated post;
    // weekly counts only those dated to the week or finer. Here every post is
    // day-aged, so the two coincide — and the test asserts each against the field
    // that actually defines it, so they stay honest when they diverge.
    const c = buildCadence(DATED, NOW);
    const sum = (b: { count: number }[]) => b.reduce((s, x) => s + x.count, 0);
    expect(sum(c.weekly)).toBe(c.weeklyPlacedPosts);
    expect(c.weeklyPlacedPosts).toBe(c.datedPosts);
    expect(sum(c.monthly)).toBe(c.datedPosts);
  });

  it("has no buckets at all when nothing is dated", () => {
    const undated = buildCadence(
      [row({ linkedin_post_id: "u", estimated_post_date: null, scraped_at: "2026-03-01" })],
      NOW,
    );
    expect(undated.weekly).toEqual([]);
    expect(undated.monthly).toEqual([]);
  });
});

describe("buildCadence — the low-N four states", () => {
  it("0 posts at all: nothing to measure, everything null, empty timeline", () => {
    const cadence = buildCadence([], NOW);
    expect(cadence.totalPosts).toBe(0);
    expect(cadence.datedPosts).toBe(0);
    expect(cadence.undatedPosts).toBe(0);
    expect(cadence.postsPerWeek).toBeNull();
    expect(cadence.medianGapDays).toBeNull();
    expect(cadence.longestGapDays).toBeNull();
    expect(cadence.daysSinceLastPost).toBeNull();
    expect(cadence.timeline).toEqual([]);
  });

  it("posts exist but 0 are DATED: counted, but cadence is NOT APPLICABLE", () => {
    const allUndated = [
      row({ linkedin_post_id: "u1", estimated_post_date: null, scraped_at: "2026-03-01" }),
      row({ linkedin_post_id: "u2", estimated_post_date: null, scraped_at: "2026-03-01" }),
      row({ linkedin_post_id: "u3", estimated_post_date: null, scraped_at: "2026-03-01" }),
    ];
    const cadence = buildCadence(allUndated, NOW);

    expect(cadence.totalPosts).toBe(3);
    expect(cadence.datedPosts).toBe(0);
    expect(cadence.undatedPosts).toBe(3);
    // Not zero — there is no cadence to report, which is a different fact.
    expect(cadence.postsPerWeek).toBeNull();
    expect(cadence.medianGapDays).toBeNull();
    expect(cadence.longestGapDays).toBeNull();
    expect(cadence.daysSinceLastPost).toBeNull();
    expect(cadence.timeline).toEqual([]);
  });

  it("exactly 1 dated post: no gap exists, but days-since-last still does", () => {
    const one = [
      row({ linkedin_post_id: "solo", estimated_post_date: "2026-01-25" }),
      row({ linkedin_post_id: "u", estimated_post_date: null, scraped_at: "2026-03-01" }),
    ];
    const cadence = buildCadence(one, NOW);

    expect(cadence.datedPosts).toBe(1);
    // ⚠️ A single post has NO gap. A gap of 0 here would be a fabricated
    // measurement — the not-applicable state, not zero.
    expect(cadence.medianGapDays).toBeNull();
    expect(cadence.longestGapDays).toBeNull();
    expect(cadence.postsPerWeek).toBeNull();
    // ...but "days since last post" is defined for a single post.
    expect(cadence.daysSinceLastPost).toBe(20); // Jan 25 → Feb 14
    expect(cadence.timeline).toEqual([dayMs("2026-01-25")]); // the single mark
  });

  it("2 dated posts on the SAME day: a measured 0-day gap, but no weekly rate", () => {
    // ⚠️ THE FOUR-STATE HINGE. Two posts one day apart of ZERO days is a MEASURED
    // zero (they really were 0 days apart), not an absence. But a weekly rate over
    // an active span of zero is undefined — not-applicable, never Infinity.
    const sameDay = [
      row({ linkedin_post_id: "x", estimated_post_date: "2026-01-10" }),
      row({ linkedin_post_id: "y", estimated_post_date: "2026-01-10" }),
    ];
    const cadence = buildCadence(sameDay, NOW);

    expect(cadence.datedPosts).toBe(2);
    expect(cadence.medianGapDays).toBe(0); // measured, genuine
    expect(cadence.longestGapDays).toBe(0); // measured, genuine
    expect(cadence.postsPerWeek).toBeNull(); // undefined over a zero span
    expect(Number.isFinite(cadence.postsPerWeek ?? 0)).toBe(true); // never Infinity/NaN
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ A WEEKLY BAR NEEDS A DATE PRECISE TO THE WEEK. `estimated_post_date` is a
// full timestamp whatever age produced it, so a month-aged post — snapped to the
// 1st — lands in whichever calendar week that 1st happened to fall in and votes
// on it as if it were a reading. Live, 227 of 272 posts are month- or year-aged,
// so a weekly chart built from every dated post is 84% invented.
//
// ⚠️ THE MONTHLY BARS ARE CORRECT AND MUST NOT NARROW. A month-aged post IS
// month-precise; excluding it there would be the mirror-image error — throwing
// away a real reading because a different chart could not use it.
// ─────────────────────────────────────────────────────────────────────────────
describe("buildCadence — weekly bars admit week-precision posts only", () => {
  // One post per precision, all in January 2026.
  //   day   Thu 2026-01-01  → week of Mon 29 Dec
  //   week  Sat 2026-01-03  → week of Mon 29 Dec
  //   month Mon 2026-01-05  → week of Mon  5 Jan   (the bar that must not appear)
  const MIXED: PostMetricsRow[] = [
    row({
      linkedin_post_id: "day",
      post_age: "2d",
      scraped_at: "2026-01-03T00:00:00.000Z",
      estimated_post_date: "2026-01-01",
    }),
    row({
      linkedin_post_id: "week",
      post_age: "1w",
      scraped_at: "2026-01-10T00:00:00.000Z",
      estimated_post_date: "2026-01-03",
    }),
    row({
      linkedin_post_id: "month",
      post_age: "1m",
      scraped_at: "2026-01-20T00:00:00.000Z",
      estimated_post_date: "2026-01-05",
    }),
  ];

  it("⚠️ MUTATION PROOF — a WEEK-aged post IS in a weekly bar, and in a monthly one", () => {
    const c = buildCadence(MIXED, NOW);
    // Both the day post and the week post fall in the week of Mon 29 Dec.
    expect(c.weekly[0]).toEqual({ label: "29 Dec", count: 2 });
    expect(c.monthly).toEqual([{ label: "Jan 26", count: 3 }]);
  });

  it("⚠️ MUTATION PROOF — a MONTH-aged post reaches the MONTHLY bar and no weekly one", () => {
    const c = buildCadence(MIXED, NOW);
    // If month-aged posts were admitted, a second bar { "5 Jan", 1 } would appear
    // — a week the client is told they posted in, on the strength of a snap.
    expect(c.weekly).toEqual([{ label: "29 Dec", count: 2 }]);
    // …while the monthly bar still counts all three. That asymmetry IS the rule.
    expect(c.monthly.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it("⚠️ MUTATION PROOF — a DAY-aged post is placed everywhere", () => {
    const only = buildCadence([MIXED[0]!], NOW);
    expect(only.weekly).toEqual([{ label: "29 Dec", count: 1 }]);
    expect(only.monthly).toEqual([{ label: "Jan 26", count: 1 }]);
    expect(only.timeline).toEqual([dayMs("2026-01-01")]);
  });

  it("counts the posts held out of the weekly bars, and keeps them out of undated", () => {
    const c = buildCadence(MIXED, NOW);
    expect(c.weeklyPlacedPosts).toBe(2);
    expect(c.weeklyCoarsePosts).toBe(1);
    // ⚠️ The month post HAS a date. Reporting it as undated would tell the reader
    // its date is missing, which is a different — and false — statement.
    expect(c.undatedPosts).toBe(0);
    expect(c.datedPosts).toBe(3);
  });

  it("⚠️ partitions the dated posts, and each chart sums to its own basis", () => {
    const c = buildCadence(MIXED, NOW);
    const sum = (b: { count: number }[]) => b.reduce((s, x) => s + x.count, 0);
    expect(c.weeklyPlacedPosts + c.weeklyCoarsePosts).toBe(c.datedPosts);
    expect(sum(c.weekly)).toBe(c.weeklyPlacedPosts);
    expect(sum(c.monthly)).toBe(c.datedPosts);
  });

  it("yields no weekly bars at all when every dated post is month-grained", () => {
    // Distinct from "nothing is dated": the marks and the monthly bars still draw.
    const c = buildCadence([MIXED[2]!], NOW);
    expect(c.weekly).toEqual([]);
    expect(c.weeklyPlacedPosts).toBe(0);
    expect(c.weeklyCoarsePosts).toBe(1);
    expect(c.monthly).toEqual([{ label: "Jan 26", count: 1 }]);
    expect(c.timeline).toHaveLength(1);
  });
});
