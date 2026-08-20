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

  it("⚠️ WITHHOLDS the gaps entirely once a post is undated", () => {
    // ⚠️ RE-TARGETED, NOT WEAKENED. This asserted 20 and 2, on the reasoning that
    // the undated post must not be counted at its SCRAPE day (June) and inflate
    // the longest gap from 20 to ~127. That reasoning was right and incomplete:
    // not inflating a gap is not the same as knowing it. The undated post really
    // was published, somewhere, and "somewhere" includes inside the 20-day gap —
    // so 20 was never a measured silence, just the silence between the posts we
    // could place.
    //
    // The anti-inflation guard it used to carry has not been lost: the sibling
    // test above asserts the June scrape instant never reaches the timeline, which
    // is where that fabrication would enter.
    const cadence = buildCadence(withUndated, NOW);
    expect(cadence.longestGapDays).toBeNull();
    expect(cadence.medianGapDays).toBeNull();
    // …and the reason is recorded as an OMISSION, not as coarseness: every dated
    // post here is day-precise.
    expect(cadence.undatedPosts).toBe(1);
    expect(cadence.dayCoarsePosts).toBe(0);
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
    // ⚠️ THE DATED POST CARRIES A DAY AGE. Recency is a day-level figure, so it
    // needs a day-precise last post; a row with a date and no age states no
    // precision at all and would withhold the figure for the wrong reason.
    const one = [
      row({
        linkedin_post_id: "solo",
        post_age: "1d",
        scraped_at: "2026-01-26T00:00:00.000Z",
        estimated_post_date: "2026-01-25",
      }),
      row({ linkedin_post_id: "u", estimated_post_date: null, scraped_at: "2026-03-01" }),
    ];
    const cadence = buildCadence(one, NOW);

    expect(cadence.datedPosts).toBe(1);
    // ⚠️ A single post has NO gap. A gap of 0 here would be a fabricated
    // measurement — the not-applicable state, not zero.
    expect(cadence.medianGapDays).toBeNull();
    expect(cadence.longestGapDays).toBeNull();
    expect(cadence.postsPerWeek).toBeNull();
    // ...but "days since last post" is defined for a single post — and an UNDATED
    // post alongside it does not withhold it. Recency depends on exactly one post,
    // so completeness of the history is irrelevant to it, unlike a gap.
    expect(cadence.daysSinceLastPost).toBe(20); // Jan 25 → Feb 14
    expect(cadence.lastPostDateIsExact).toBe(true);
    expect(cadence.timeline).toEqual([dayMs("2026-01-25")]); // the single mark
  });

  it("2 dated posts on the SAME day: a measured 0-day gap, but no weekly rate", () => {
    // ⚠️ THE FOUR-STATE HINGE. Two posts one day apart of ZERO days is a MEASURED
    // zero (they really were 0 days apart), not an absence. But a weekly rate over
    // an active span of zero is undefined — not-applicable, never Infinity.
    const sameDay = [
      row({
        linkedin_post_id: "x",
        post_age: "1d",
        scraped_at: "2026-01-11T00:00:00.000Z",
        estimated_post_date: "2026-01-10",
      }),
      row({
        linkedin_post_id: "y",
        post_age: "1d",
        scraped_at: "2026-01-11T00:00:00.000Z",
        estimated_post_date: "2026-01-10",
      }),
    ];
    const cadence = buildCadence(sameDay, NOW);

    expect(cadence.datedPosts).toBe(2);
    expect(cadence.medianGapDays).toBe(0); // measured, genuine
    expect(cadence.longestGapDays).toBe(0); // measured, genuine
    expect(cadence.postsPerWeek).toBeNull(); // undefined over a zero span
    expect(Number.isFinite(cadence.postsPerWeek ?? 0)).toBe(true); // never Infinity/NaN
  });

  it("⚠️ tells a REAL 0-day gap apart from the month-snap artifact that looks like one", () => {
    // The pair of assertions that gives the rule its point. Two DAY-AGED posts on
    // one day are 0 days apart and that is a measurement. Two MONTH-AGED posts in
    // one month are also 0 apart in the stored data — and that is an artifact of
    // snapping both to the 1st, not a fact about the client. Identical arithmetic,
    // opposite meanings, and only the precision of the inputs separates them.
    const sameDayReal = [
      row({
        linkedin_post_id: "x",
        post_age: "1d",
        scraped_at: "2026-01-11T00:00:00.000Z",
        estimated_post_date: "2026-01-10",
      }),
      row({
        linkedin_post_id: "y",
        post_age: "1d",
        scraped_at: "2026-01-11T00:00:00.000Z",
        estimated_post_date: "2026-01-10",
      }),
    ];
    const sameMonthArtifact = [
      row({ linkedin_post_id: "p", post_age: "2m", estimated_post_date: "2025-12-01" }),
      row({ linkedin_post_id: "q", post_age: "2m", estimated_post_date: "2025-12-01" }),
    ];

    expect(buildCadence(sameDayReal, NOW).medianGapDays).toBe(0);
    expect(buildCadence(sameMonthArtifact, NOW).medianGapDays).toBeNull();
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

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE FOUR FIGURES ARE FOUR DIFFERENT QUESTIONS AND SURVIVE IMPRECISION
// DIFFERENTLY. One blanket rule over all of them would be the wrong shape:
//
//   • A GAP needs both endpoints day-precise AND needs that nothing was published
//     between them. Neither survives coarse dates. `snapToMonthStart` puts every
//     month-aged post on the 1st at midnight, so posts sharing a month collapse to
//     the SAME INSTANT and their pairwise gap is exactly 0. Live, 203 of 272 posts
//     are month-aged across a handful of months, so the gaps array is mostly zeros
//     and the median collapses toward 0 days — for a client who posts monthly.
//   • A RATE needs an accurate count and an accurate span. It tolerates per-item
//     noise entirely: shuffling the interior dates within the span does not move
//     it. Only the two endpoints carry error, and over a long span that is small.
//   • A RECENCY depends on exactly ONE post and inherits that post's precision.
//
// ⚠️ AND THE OBVIOUS FIX IS A NEW FALSEHOOD. Filtering the timeline to day-precise
// posts and recomputing gaps does not repair this: the surviving gaps then stretch
// ACROSS the dropped posts, so the figure overstates the client's silence. A
// number that is too small would have been replaced by one that is too large.
// These figures are WITHHELD, never recomputed on a filtered array.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seven month-aged posts across three months — the live shape, in miniature.
 *
 * ⚠️ ALL SEVEN LAND ON JUST THREE INSTANTS. `snapToMonthStart` puts every
 * month-aged post on the 1st at midnight UTC, so posts sharing a month are
 * indistinguishable and five of the six pairwise gaps are exactly 0.
 *
 * Dated before NOW (2026-02-14) on purpose: the month snap is biased LATE, so a
 * real month-aged post never resolves past its scrape — a fixture that did would
 * be testing a state the resolver cannot produce.
 */
const MONTH_AGED: PostMetricsRow[] = [
  row({ linkedin_post_id: "n1", post_age: "3m", estimated_post_date: "2025-11-01" }),
  row({ linkedin_post_id: "n2", post_age: "3m", estimated_post_date: "2025-11-01" }),
  row({ linkedin_post_id: "n3", post_age: "3m", estimated_post_date: "2025-11-01" }),
  row({ linkedin_post_id: "d1", post_age: "2m", estimated_post_date: "2025-12-01" }),
  row({ linkedin_post_id: "d2", post_age: "2m", estimated_post_date: "2025-12-01" }),
  row({ linkedin_post_id: "j1", post_age: "1m", estimated_post_date: "2026-01-01" }),
  row({ linkedin_post_id: "j2", post_age: "1m", estimated_post_date: "2026-01-01" }),
];

describe("buildCadence — gaps are WITHHELD when the dates cannot support them", () => {
  it("⚠️ MUTATION PROOF — month-aged posts must not report a median gap of 0 days", () => {
    // Today this returns 0. Seven posts snap to three midnights, so five of the
    // six pairwise gaps are exactly 0 and the median lands on 0 — reported to a
    // client as "median gap between posts: 0 days" when they posted seven times
    // over three months. That figure is the reason this slice exists.
    const c = buildCadence(MONTH_AGED, NOW);
    expect(c.medianGapDays).toBeNull();
    expect(c.longestGapDays).toBeNull();
  });

  it("⚠️ POSITIVE CONTROL — all-day-precision posts STILL report real gaps", () => {
    // ⚠️ THIS IS THE TEST THAT STOPS THE RULE COLLAPSING INTO `return null`. An
    // assertion that a figure is null passes just as well against a function that
    // never computes anything; this one fails against that function.
    const c = buildCadence(DATED, NOW);
    expect(c.medianGapDays).toBe(2);
    expect(c.longestGapDays).toBe(20);
  });

  it("withholds gaps when even ONE post among many is coarser than a day", () => {
    // Four exact posts and one month-aged: the month-aged post could have been
    // published anywhere in its month, including inside a gap between two of the
    // others, so no gap between them is known to be a real silence.
    const c = buildCadence(
      [...DATED, row({ linkedin_post_id: "m", post_age: "1m", estimated_post_date: "2026-01-01" })],
      NOW,
    );
    expect(c.medianGapDays).toBeNull();
    expect(c.longestGapDays).toBeNull();
  });

  it("⚠️ withholds gaps when a post is UNDATED — an omitted post breaks completeness", () => {
    // A gap is only a real silence if nothing was published inside it. An undated
    // post is a post we know happened and cannot place, so it may sit in any gap.
    // The old test asserted 20 here, on the reasoning that the undated post must
    // not INFLATE the gap to ~127 days. That reasoning was right and incomplete:
    // not inflating it is not the same as knowing it.
    const c = buildCadence(
      [
        ...DATED,
        row({ linkedin_post_id: "ghost", estimated_post_date: null, scraped_at: "2026-06-01" }),
      ],
      NOW,
    );
    expect(c.medianGapDays).toBeNull();
    expect(c.longestGapDays).toBeNull();
  });

  it("counts the posts that put the gaps out of reach, in the existing vocabulary", () => {
    const c = buildCadence(MONTH_AGED, NOW);
    expect(c.dayPlacedPosts).toBe(0);
    expect(c.dayCoarsePosts).toBe(7);
    // ⚠️ AND THEY ARE NOT UNDATED. Every one of these posts has a date.
    expect(c.undatedPosts).toBe(0);
    expect(c.dayPlacedPosts + c.dayCoarsePosts).toBe(c.datedPosts);
  });

  it("counts a mixed history correctly — day, week and month all distinguished", () => {
    const mixed: PostMetricsRow[] = [
      row({ linkedin_post_id: "d", post_age: "1d", estimated_post_date: "2026-01-02" }),
      row({ linkedin_post_id: "w", post_age: "1w", estimated_post_date: "2026-01-09" }),
      row({ linkedin_post_id: "m", post_age: "1m", estimated_post_date: "2026-02-01" }),
    ];
    const c = buildCadence(mixed, NOW);
    expect(c.dayPlacedPosts).toBe(1);
    expect(c.dayCoarsePosts).toBe(2); // the week post AND the month post
    // ⚠️ The WEEK bars keep the week post — a different granularity, a different
    // question. `dayCoarsePosts` must not be confused with `weeklyCoarsePosts`.
    expect(c.weeklyPlacedPosts).toBe(2);
    expect(c.weeklyCoarsePosts).toBe(1);
  });
});

describe("buildCadence — postsPerWeek SURVIVES coarse dates, deliberately", () => {
  it("⚠️ still reports a rate over month-aged posts — a rate is not a gap", () => {
    // The numerator is a count of real posts and carries no date error at all.
    // The denominator is one span, so only its two ENDPOINTS carry error — the
    // interior dates cancel out entirely. Withholding this alongside the gaps
    // would be the reflexive move, and it would delete a figure the data supports.
    // Span 2025-11-01 → 2026-01-01 = 61 days ≈ 8.71 weeks; 7 posts ÷ 8.71 = 0.8.
    const c = buildCadence(MONTH_AGED, NOW);
    expect(c.postsPerWeek).toBe(0.8);
  });

  it("still has no rate when the span is zero-length — unchanged, and not a zero", () => {
    // Every post in one month collapses to one instant. A rate over a zero-length
    // span is undefined, which is NOT-APPLICABLE and never 0.
    const oneMonth = MONTH_AGED.slice(0, 3);
    expect(buildCadence(oneMonth, NOW).postsPerWeek).toBeNull();
  });
});

describe("buildCadence — daysSinceLastPost inherits the LAST post's precision", () => {
  it("⚠️ withholds the day count when the most recent post is month-aged", () => {
    // The figure depends on exactly one post. A month-aged last post could be
    // anywhere in its month, so "20 days since" could be wrong by weeks.
    const c = buildCadence(MONTH_AGED, NOW);
    expect(c.daysSinceLastPost).toBeNull();
    expect(c.lastPostDateIsExact).toBe(false);
  });

  it("⚠️ POSITIVE CONTROL — reports it when the most recent post IS day-aged", () => {
    // Fails against a blanket `null`. Jan 25 → Feb 14 is 20 days.
    const c = buildCadence(DATED, NOW);
    expect(c.daysSinceLastPost).toBe(20);
    expect(c.lastPostDateIsExact).toBe(true);
  });

  it("⚠️ looks only at the LAST post, not at the whole history", () => {
    // Coarse posts earlier in the history do not touch recency: the question is
    // "when did they last post", and only one post answers it. This is exactly
    // where a blanket "any coarse post → null" rule would be wrong.
    const c = buildCadence(
      [
        row({ linkedin_post_id: "old", post_age: "6m", estimated_post_date: "2025-09-01" }),
        row({ linkedin_post_id: "new", post_age: "1d", estimated_post_date: "2026-01-25" }),
      ],
      NOW,
    );
    expect(c.daysSinceLastPost).toBe(20);
    expect(c.lastPostDateIsExact).toBe(true);
    // …while the gaps between them are still out of reach.
    expect(c.medianGapDays).toBeNull();
  });
});

describe("buildCadence — ⚠️ MUTATION PROOF: the bars are untouched by all of this", () => {
  it("keeps the monthly bars over every dated post, whatever its precision", () => {
    const c = buildCadence(MONTH_AGED, NOW);
    expect(c.monthly).toEqual([
      { label: "Nov 25", count: 3 },
      { label: "Dec 25", count: 2 },
      { label: "Jan 26", count: 2 },
    ]);
    expect(c.monthly.reduce((s, b) => s + b.count, 0)).toBe(c.datedPosts);
  });

  it("keeps the weekly bars on their own week-granularity rule", () => {
    // Month-aged posts are too coarse for a weekly bar — that was last slice's
    // rule and it is unchanged. Withholding the gap figures must not also empty
    // these, and admitting them here would be the mirror-image error.
    expect(buildCadence(MONTH_AGED, NOW).weekly).toEqual([]);
    expect(buildCadence(DATED, NOW).weekly.reduce((s, b) => s + b.count, 0)).toBe(4);
  });

  it("keeps every timeline mark — the marks view places every dated post", () => {
    expect(buildCadence(MONTH_AGED, NOW).timeline).toHaveLength(7);
  });
});
