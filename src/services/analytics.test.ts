import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the Supabase server client + cookies so nothing hits the DB. ─
const { postsState } = vi.hoisted(() => ({
  postsState: {
    rows: [] as unknown[],
    error: null as { message: string } | null,
    eqCalls: [] as unknown[][],
    schemaCalls: [] as string[],
    fromCalls: [] as string[],
    orderCalls: [] as unknown[][],
    orCalls: [] as string[],
    registry: null as { id: string; name: string }[] | null,
    uploads: null as unknown[] | null,
    registryCalls: 0,
    uploadsCalls: 0,
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));

/**
 * ⚠️ THIS MOCK MODELS POSTGREST'S 1000-ROW RESPONSE CAP, AND THAT IS THE POINT.
 *
 * The previous version returned `postsState.rows` wholesale however the query was
 * built, so it could not tell a paged read from an unpaged one — which is why
 * the dashboard's silent cap survived here unnoticed while two sibling reads were
 * being fixed. A request with no `.range()` gets the first PAGE_SIZE rows and a
 * 200: no error, no signal. Modelling that is what lets the guards below fail
 * against the old read instead of passing against any implementation.
 *
 * Each `.from()` hands back a FRESH chain, because `readAllPages` issues pages
 * 1..n CONCURRENTLY and a shared cursor would let one page overwrite another's
 * range — the real client builds a new query per call too.
 */
vi.mock("@/lib/supabase/server", () => {
  const client: Record<string, unknown> = {
    // ⚠️ STILL PRESENT, AND DELIBERATELY SO. ADR 0010 moved every read onto the
    // app-owned `public.client_posts`, which lives in the DEFAULT schema — so the
    // seam must never call `.schema()` again. Keeping the recorder here means a
    // regression is caught as a non-empty `schemaCalls` instead of as a TypeError
    // that could be mistaken for an unrelated mock problem.
    schema: (s: string) => {
      postsState.schemaCalls.push(s);
      return client;
    },
    from: (t: string) => {
      postsState.fromCalls.push(t);
      const chain: Record<string, unknown> = {};
      let from = 0;
      // The implicit window PostgREST applies when no range is asked for.
      let to = PAGE_SIZE - 1;
      let wantsCount = false;

      chain.select = (_columns?: unknown, opts?: { count?: string }) => {
        if (opts?.count === "exact") wantsCount = true;
        return chain;
      };
      chain.eq = (...a: unknown[]) => {
        postsState.eqCalls.push(a);
        return chain;
      };
      chain.or = (f: string) => {
        postsState.orCalls.push(f);
        return chain;
      };
      chain.order = (...a: unknown[]) => {
        postsState.orderCalls.push(a);
        return chain;
      };
      chain.range = (f: number, t2: number) => {
        from = f;
        to = t2;
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            if (postsState.error) return { data: null, error: postsState.error, count: null };
            return {
              data: postsState.rows.slice(from, to + 1),
              error: null,
              count: wantsCount ? postsState.rows.length : null,
            };
          })
          .then(resolve, reject);
      return chain;
    },
  };
  return { createClient: () => client };
});

vi.mock("@/services/clients", () => ({
  listClientRegistry: () => {
    postsState.registryCalls += 1;
    return Promise.resolve(postsState.registry);
  },
}));
vi.mock("@/services/uploads", () => ({
  listAllUploads: () => {
    postsState.uploadsCalls += 1;
    return Promise.resolve(postsState.uploads);
  },
}));

import type { RangeSelection } from "@/lib/date-range";
import { MAX_PAGES, PAGE_SIZE } from "@/lib/supabase/paged";

import type { SeriesPoint } from "@/services/types";

import {
  buildDashboardAnalytics,
  currentWindow,
  effectiveMs,
  getDashboardAnalytics,
  placePost,
  type PostMetricsRow,
} from "./analytics";

function metricsRow(over: Partial<PostMetricsRow>): PostMetricsRow {
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
    scraped_at: "2026-07-01T00:00:00.000Z",
    uploaded_at: null,
    ...over,
  };
}

const NOW = new Date("2026-07-16T12:00:00.000Z");

// The three presets the dashboard offers, plus all-time, in the one vocabulary
// `RangeSelection` now gives every surface.
const R7: RangeSelection = { kind: "preset", days: 7 };
const R30: RangeSelection = { kind: "preset", days: 30 };
const R90: RangeSelection = { kind: "preset", days: 90 };
const ALL: RangeSelection = { kind: "all" };

// Two current-window posts (Jul), one prior-window (May), one hour-age (null date).
const ROWS: PostMetricsRow[] = [
  metricsRow({
    linkedin_post_id: "p1",
    estimated_post_date: "2026-07-10",
    impressions: 1000,
    likes: 100,
    comments: 10,
    reposts: 5,
    saves: 2,
    interactions: 117,
    scraped_at: "2026-07-15T09:00:00.000Z",
    post_content: "First post content",
  }),
  metricsRow({
    linkedin_post_id: "p2",
    estimated_post_date: "2026-07-01",
    impressions: 500,
    likes: 40,
    comments: 5,
    reposts: 3,
    saves: 1,
    interactions: 49,
    scraped_at: "2026-07-14T08:00:00.000Z",
    post_content: "Second",
  }),
  metricsRow({
    linkedin_post_id: "p3",
    estimated_post_date: "2026-05-20",
    impressions: 600,
    likes: 30,
    comments: 4,
    reposts: 2,
    saves: 0,
    interactions: 36,
    scraped_at: "2026-05-25T10:00:00.000Z",
    post_content: "Old prior-window post",
  }),
  metricsRow({
    linkedin_post_id: "p4",
    estimated_post_date: null,
    post_age: "5h",
    impressions: 200,
    likes: 10,
    comments: 1,
    interactions: 11,
    scraped_at: "2026-07-16T06:00:00.000Z",
    post_content: "Hour-age post",
  }),
];

describe("effectiveMs (pure)", () => {
  it("uses estimated_post_date when it parses", () => {
    expect(effectiveMs(metricsRow({ estimated_post_date: "2026-07-10" }))).toBe(
      Date.parse("2026-07-10"),
    );
  });

  it("falls back to scraped_at when estimated_post_date is null (hour-age posts)", () => {
    // `src/lib/post-date.ts` leaves estimated_post_date NULL for "23h"-style ages,
    // deliberately. The scrape timestamp is the best available stand-in for when
    // such a post was published.
    const row = metricsRow({ estimated_post_date: null, scraped_at: "2026-07-15T09:00:00.000Z" });
    expect(effectiveMs(row)).toBe(Date.parse("2026-07-15T09:00:00.000Z"));
  });

  it("falls back to scraped_at when estimated_post_date is unparseable", () => {
    const row = metricsRow({
      estimated_post_date: "not a date",
      scraped_at: "2026-07-15T09:00:00.000Z",
    });
    expect(effectiveMs(row)).toBe(Date.parse("2026-07-15T09:00:00.000Z"));
  });

  it("is null when neither date is usable", () => {
    expect(effectiveMs(metricsRow({ estimated_post_date: null, scraped_at: null }))).toBeNull();
    expect(
      effectiveMs(metricsRow({ estimated_post_date: null, scraped_at: "nonsense" })),
    ).toBeNull();
  });
});

describe("hour-age posts (null estimated_post_date) are counted", () => {
  it("counts an hour-age post in totalPosts and the current window", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });

    // p4 has no estimated_post_date but was scraped 6h before NOW — it is a real
    // post from within the window and must not be silently dropped.
    expect(a.totalPosts).toBe(3);
    expect(a.hero.value).toBe(1700); // 1000 + 500 + p4's 200
  });

  it("includes an hour-age post's impressions in the series buckets", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    // The series must reconcile with the hero, including the hour-age row.
    expect(a.impressionsSeries.reduce((s, p) => s + p.value, 0)).toBe(1700);
  });

  it("still DISPLAYS post_age rather than a date for that post", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    const p4 = a.recentPosts.find((p) => p.id === "p4")!;
    // Counting it uses scraped_at; showing it must not — the scrape date is not
    // the publish date, and "5h" is the more honest label.
    expect(p4.date).toBe("5h");
  });

  it("still excludes a null-date post whose scrape falls outside the window", () => {
    // Proves the fallback is a real date test, not a blanket include.
    const stale = metricsRow({
      linkedin_post_id: "p5",
      estimated_post_date: null,
      post_age: "3h",
      impressions: 900,
      scraped_at: "2026-05-20T10:00:00.000Z", // prior window, not current
    });
    const a = buildDashboardAnalytics([...ROWS, stale], { range: R30, now: NOW });

    expect(a.totalPosts).toBe(3); // unchanged — p5 is not in the current window
    expect(a.hero.value).toBe(1700);
  });
});

describe("buildDashboardAnalytics (pure)", () => {
  it("sums the current window and computes deltas vs the prior window", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });

    // Current window (Jul 1 + Jul 10 + the hour-age p4) impressions = 1700;
    // prior (May 20) = 600. p4 counts via its scraped_at — see `effectiveMs`.
    expect(a.hero).toEqual({ label: "Impressions", value: 1700, delta: 183, direction: "up" });
    expect(a.kpis.map((k) => k.label)).toEqual(["Posts", "Likes", "Comments", "Shares", "Saves"]);
    const likes = a.kpis.find((k) => k.label === "Likes")!;
    expect(likes.value).toBe(150); // 100 + 40 + p4's 10
    expect(likes.direction).toBe("up");
    const saves = a.kpis.find((k) => k.label === "Saves")!;
    expect(saves.value).toBe(3); // grew from 0 in prior window
    expect(saves.direction).toBe("up");
  });

  it("computes the weighted engagement rate and a signed points delta", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    // interactions 177 / impressions 1700 * 100 = 10.41; prior 36/600*100 = 6.0.
    expect(a.engagement.value).toBeCloseTo(10.4, 1);
    expect(a.engagement.delta).toBeCloseTo(4.4, 1);
  });

  it("counts the window, picks recent posts, and formats lastSync", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    expect(a.totalPosts).toBe(3); // hour-age (null date) counts via scraped_at
    // ⚠️ THE " UTC" WAS APPENDED ON 2026-08-13. `formatSync` slices an ISO
    // string, so this figure has always BEEN UTC — it simply never said so, and
    // "last sync 2026-07-16 06:00" is read as local time by every operator who
    // sees it. The instant is unchanged; only its label is new.
    expect(a.lastSync).toBe("2026-07-16 06:00 UTC"); // max scraped_at (p4)

    // Recent = newest first by estimated_post_date (fallback scraped_at). p4 (5h) is newest.
    expect(a.recentPosts).toHaveLength(4);
    expect(a.recentPosts[0]!.id).toBe("p4");
    expect(a.recentPosts[0]!.date).toBe("5h"); // post_age used when date is null
    expect(a.recentPosts.find((p) => p.id === "p1")!.date).toBe("Jul 10");
    expect(a.recentPosts[0]).not.toHaveProperty("format");
  });

  // ⚠️ REPLACES the old fixed-bucket-COUNT assertions (7 / 5 / 3 per preset, the
  // retired `RANGE_BUCKETS`). Bucket WIDTH is now derived from the span by one
  // rule — daily ≤14d, weekly ≤120d, monthly beyond — so a preset and a custom
  // range of the same length draw identically. 90d changes the most: it drew 3
  // month-ish bars and now draws 13 weekly ones. Same data, different bars.
  it("buckets the current window by WIDTH, into a series that totals the hero value", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });

    expect(a.impressionsSeries).toHaveLength(5); // 30d → ceil(30/7) weekly buckets
    expect(a.impressionsSeries.reduce((s, p) => s + p.value, 0)).toBe(1700);
    expect(a.engagementSeries).toHaveLength(5);

    expect(buildDashboardAnalytics(ROWS, { range: R7, now: NOW }).impressionsSeries).toHaveLength(
      7, // ≤14d → one bar per day
    );
    expect(buildDashboardAnalytics(ROWS, { range: R90, now: NOW }).impressionsSeries).toHaveLength(
      13, // was 3 under the retired per-preset bucket count
    );
  });

  it("labels buckets by DATE, not by a preset-specific scheme", () => {
    // The retired `bucketLabel` branched on the literal strings "7d"/"90d" and
    // emitted "Wk 1…Wk 5" for everything else — a label that cannot describe an
    // arbitrary window at all.
    //
    // ⚠️ THESE FIVE LABELS MOVED FORWARD BY A DAY ON 2026-08-13, AND THE OLD
    // ONES WERE THE WRONG ONES. `NOW` is 16 Jul 12:00Z, so the old rolling
    // `now − 30 × DAY_MS` opened the window at 16 Jun 12:00Z and captioned
    // bucket 0 "16 Jun" — while the earliest post it could hold was dated the
    // 17th, since `estimated_post_date` sits at midnight. Every bar named the
    // day before its own posts. `resolveWindow` now snaps presets to 00:00 UTC,
    // so a bucket's label and its contents are the same day.
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });

    expect(a.impressionsSeries.map((p) => p.label)).toEqual([
      "17 Jun",
      "24 Jun",
      "1 Jul",
      "8 Jul",
      "15 Jul",
    ]);
    expect(a.impressionsSeries.some((p) => /^Wk /.test(p.label))).toBe(false);
  });

  it("draws a custom window on the same rule a preset of that length gets", () => {
    // 12 Jun – 29 Jul 2026 is 48 days → weekly → ceil(48/7) = 7 buckets.
    const custom: RangeSelection = { kind: "custom", startDay: "2026-06-12", endDay: "2026-07-29" };
    const a = buildDashboardAnalytics(ROWS, { range: custom, now: NOW });

    expect(a.impressionsSeries).toHaveLength(7);
    expect(a.impressionsSeries[0]!.label).toBe("12 Jun");
  });
});

describe("the window is one definition, and everything derives from it", () => {
  it("keeps totalPosts identical to currentWindow's own length", () => {
    // ⚠️ The property `currentWindow` is exported to guarantee. A second filter
    // is how the count above a table comes to disagree with the rows in it.
    for (const range of [R7, R30, R90, ALL]) {
      const a = buildDashboardAnalytics(ROWS, { range, now: NOW });
      expect(a.totalPosts, JSON.stringify(range)).toBe(
        currentWindow(ROWS, { range, now: NOW }).length,
      );
    }
  });

  it("baselines a 48-day custom window on exactly the 48 days before it", () => {
    // One row inside the window, one row inside the prior window, one far older.
    const inWindow = metricsRow({
      linkedin_post_id: "w1",
      estimated_post_date: "2026-06-20",
      impressions: 100,
      scraped_at: "2026-06-21T00:00:00.000Z",
    });
    // The prior window is 12 Jun minus 48 days = 25 Apr, up to (not incl.) 12 Jun.
    const inPrior = metricsRow({
      linkedin_post_id: "w2",
      estimated_post_date: "2026-05-01",
      impressions: 50,
      scraped_at: "2026-05-02T00:00:00.000Z",
    });
    const tooOld = metricsRow({
      linkedin_post_id: "w3",
      estimated_post_date: "2026-04-24", // one day before the prior window opens
      impressions: 999,
      scraped_at: "2026-04-25T00:00:00.000Z",
    });
    const custom: RangeSelection = { kind: "custom", startDay: "2026-06-12", endDay: "2026-07-29" };

    const a = buildDashboardAnalytics([inWindow, inPrior, tooOld], { range: custom, now: NOW });

    // 100 vs 50 → +100%. `tooOld` must not reach the baseline, or the delta moves.
    expect(a.hero.value).toBe(100);
    expect(a.hero.delta).toBe(100);
    expect(a.hero.direction).toBe("up");
  });
});

describe("ALL TIME — no comparable prior period, which is not a zero", () => {
  it("reaches back past every preset's horizon", () => {
    const ancient = metricsRow({
      linkedin_post_id: "old",
      estimated_post_date: "2019-01-01",
      impressions: 7,
      scraped_at: "2019-01-02T00:00:00.000Z",
    });
    const a = buildDashboardAnalytics([...ROWS, ancient], { range: ALL, now: NOW });

    expect(a.totalPosts).toBe(5); // every datable row, including the 2019 one
    expect(a.hero.value).toBe(2307); // 1700 + p3's 600 + 7
  });

  it("reports NULL deltas — absent, never 0 and never a direction", () => {
    // ⚠️ THE WHOLE POINT. 0 would render "▲ 0%", asserting the figure held
    // steady against a period that does not exist.
    const a = buildDashboardAnalytics(ROWS, { range: ALL, now: NOW });

    expect(a.hero.delta).toBeNull();
    expect(a.hero.direction).toBeNull();
    for (const kpi of a.kpis) {
      expect(kpi.delta, kpi.label).toBeNull();
      expect(kpi.direction, kpi.label).toBeNull();
    }
    expect(a.engagement.delta).toBeNull();
  });

  it("still reports the VALUES, which are perfectly real", () => {
    const a = buildDashboardAnalytics(ROWS, { range: ALL, now: NOW });

    expect(a.hero.value).toBe(2300); // all four rows, including the May one
    expect(a.engagement.value).toBeGreaterThan(0);
  });

  it("MEASURES THE DATA'S OWN SPAN rather than asking bucketPlan for Infinity", () => {
    // ⚠️ `bucketPlan` THROWS on a non-finite span by design (date-range.ts) —
    // an honest Infinity beats a fabricated bucket count. The caller must
    // measure earliest-post → now itself.
    const a = buildDashboardAnalytics(ROWS, { range: ALL, now: NOW });

    // Earliest effective date is p3 on 2026-05-20; through 16 Jul is 58 days →
    // weekly → ceil(58/7) = 9 buckets, opening on the earliest post's own day.
    expect(a.impressionsSeries).toHaveLength(9);
    expect(a.impressionsSeries[0]!.label).toBe("20 May");
    expect(a.impressionsSeries.reduce((s, p) => s + p.value, 0)).toBe(2300);
  });

  it("draws NO BUCKET AT ALL when there is no data to span", () => {
    // Zero rows is not a zero-height bar; there is no span to draw.
    const a = buildDashboardAnalytics([], { range: ALL, now: NOW });

    expect(a.totalPosts).toBe(0);
    expect(a.impressionsSeries).toEqual([]);
    expect(a.engagementSeries).toEqual([]);
  });

  it("draws a single day for a single post", () => {
    const only = metricsRow({
      linkedin_post_id: "one",
      estimated_post_date: "2026-07-16",
      impressions: 42,
      scraped_at: "2026-07-16T00:00:00.000Z",
    });
    const a = buildDashboardAnalytics([only], { range: ALL, now: NOW });

    expect(a.impressionsSeries).toHaveLength(1);
    expect(a.impressionsSeries[0]!.value).toBe(42);
  });
});

describe("every non-all-time range keeps the delta behaviour it has today", () => {
  it("still reads a prior window of genuine zero as `grew from nothing`", () => {
    // ⚠️ A prior window that EXISTS and summed to 0 is a real comparison, and is
    // categorically different from all-time's absent one. It must keep its 100%.
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    const saves = a.kpis.find((k) => k.label === "Saves")!;

    expect(saves.delta).toBe(100);
    expect(saves.direction).toBe("up");
  });

  it("yields an empty dashboard when the current window has no posts", () => {
    // May post + a null-date post scraped back in May. Neither falls in the
    // current window, so the dashboard is genuinely empty. (p4 is deliberately
    // NOT used here any more — its recent scrape now puts it in the window.)
    const staleHourAge = metricsRow({
      linkedin_post_id: "p5",
      estimated_post_date: null,
      post_age: "3h",
      impressions: 900,
      scraped_at: "2026-05-20T10:00:00.000Z",
    });
    const priorOnly = [ROWS[2]!, staleHourAge];
    const a = buildDashboardAnalytics(priorOnly, { range: R30, now: NOW });
    expect(a.totalPosts).toBe(0);
    expect(a.hero.value).toBe(0);
    expect(a.engagement.value).toBe(0);
    expect(a.recentPosts).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISHING VOLUME IS A KPI, NOT A CAPTION. The engagement outputs were earned
// on a number of posts; that number belongs in the row beside them, with the
// same vs-prior delta every other KPI carries.
// ─────────────────────────────────────────────────────────────────────────────
describe("the Posts KPI (publishing volume)", () => {
  it("leads the KPI row with the current window's post count", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    // Posts is the volume the engagement outputs were earned on, so it reads
    // Posts → Likes → Comments → Shares → Saves.
    expect(a.kpis[0]!.label).toBe("Posts");
    expect(a.kpis[0]!.value).toBe(3); // p1 + p2 + hour-age p4, exactly totalPosts
    expect(a.kpis[0]!.value).toBe(a.totalPosts);
  });

  it("carries a vs-prior delta built from the two windows' counts", () => {
    const a = buildDashboardAnalytics(ROWS, { range: R30, now: NOW });
    // current 3 posts vs prior 1 (May p3): (3 − 1) / 1 × 100 = 200%, up.
    expect(a.kpis[0]).toEqual({ label: "Posts", value: 3, delta: 200, direction: "up" });
  });

  it("reports a DECLINE when fewer posts went out than in the prior window", () => {
    // One current post; three in the prior 30-day window. A count that fell must
    // read as a down delta, not a flat one — the discriminator against a Posts
    // KPI wired to compare a window against itself.
    const rows: PostMetricsRow[] = [
      metricsRow({ linkedin_post_id: "cur", estimated_post_date: "2026-07-10", impressions: 10 }),
      metricsRow({ linkedin_post_id: "pr1", estimated_post_date: "2026-06-01", impressions: 10 }),
      metricsRow({ linkedin_post_id: "pr2", estimated_post_date: "2026-06-05", impressions: 10 }),
      metricsRow({ linkedin_post_id: "pr3", estimated_post_date: "2026-05-20", impressions: 10 }),
    ];
    const a = buildDashboardAnalytics(rows, { range: R30, now: NOW });
    // (1 − 3) / 3 × 100 = −66.7 → 67%, down.
    expect(a.kpis[0]).toEqual({ label: "Posts", value: 1, delta: 67, direction: "down" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE WEEKDAY IS WHEN THE POST WENT OUT, NOT WHEN IT WAS SCRAPED — AND NOT EVERY
// POST HAS ONE TO GIVE.
//
// ⚠️ TWO SEPARATE DISQUALIFICATIONS, COUNTED SEPARATELY. A post whose date was
// never resolved (an hour-age post) is UNDATED; a post dated from a week or month
// age is DATED BUT TOO COARSE — a week age lands on the scrape's own weekday and a
// month age on whatever weekday the 1st fell on. Either one, bucketed anyway, turns
// "which weekday lands best" into "which weekday we happened to scrape". Both are
// excluded and each is counted under its own name, because a reader told the date
// is MISSING when it is merely BLUNT goes looking for a fault that is not there.
// ─────────────────────────────────────────────────────────────────────────────
describe("average impressions by weekday", () => {
  const wk = (label: string, data: SeriesPoint[]) => data.find((d) => d.label === label)!.value;

  // All four posts fall in the 30-day current window ending at NOW (2026-07-16).
  //   w1 Wed 2026-07-01 · 100 impressions   w2 Wed 2026-07-08 · 300 impressions
  //   w3 Fri 2026-07-10 · 500 impressions
  //   w4 UNDATED (est null) scraped Thu 2026-07-16 · 999 impressions
  //
  // ⚠️ EACH DATED ROW CARRIES A DAY AGE THAT RESOLVES TO ITS OWN DATE, and it has
  // to: the weekday chart admits day-precision posts only, and precision is read
  // off `post_age`. These three rows previously carried a date and NO age, which
  // asserted a weekday from a row that never said how precisely it was known.
  const WEEKDAY_ROWS: PostMetricsRow[] = [
    metricsRow({
      linkedin_post_id: "w1",
      post_age: "3d",
      scraped_at: "2026-07-04T00:00:00.000Z",
      estimated_post_date: "2026-07-01",
      impressions: 100,
    }),
    metricsRow({
      linkedin_post_id: "w2",
      post_age: "2d",
      scraped_at: "2026-07-10T00:00:00.000Z",
      estimated_post_date: "2026-07-08",
      impressions: 300,
    }),
    metricsRow({
      linkedin_post_id: "w3",
      post_age: "1d",
      scraped_at: "2026-07-11T00:00:00.000Z",
      estimated_post_date: "2026-07-10",
      impressions: 500,
    }),
    metricsRow({
      linkedin_post_id: "w4",
      estimated_post_date: null,
      post_age: "5h",
      impressions: 999,
      scraped_at: "2026-07-16T06:00:00.000Z",
    }),
  ];

  it("returns seven buckets, Sunday through Saturday", () => {
    const a = buildDashboardAnalytics(WEEKDAY_ROWS, { range: R30, now: NOW });
    expect(a.impressionsByWeekday.map((d) => d.label)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("averages each weekday's impressions — the MEAN, never the sum", () => {
    const a = buildDashboardAnalytics(WEEKDAY_ROWS, { range: R30, now: NOW });
    // Two Wednesday posts: mean(100, 300) = 200. A sum would read 400 and let a
    // high-volume weekday dominate a chart that is meant to compare per-post reach.
    expect(wk("Wed", a.impressionsByWeekday)).toBe(200);
    expect(wk("Fri", a.impressionsByWeekday)).toBe(500);
  });

  it("dates each post by its estimated_post_date weekday, NOT its scrape weekday", () => {
    const a = buildDashboardAnalytics(WEEKDAY_ROWS, { range: R30, now: NOW });
    // w4 was scraped on a Thursday but has no resolved publish date. If it were
    // bucketed by effectiveMs/scraped_at it would drop 999 onto Thursday; it must
    // not. Thursday saw no DATABLE post, so it is a genuine zero.
    expect(wk("Thu", a.impressionsByWeekday)).toBe(0);
  });

  it("excludes undated posts and counts how many were excluded", () => {
    const a = buildDashboardAnalytics(WEEKDAY_ROWS, { range: R30, now: NOW });
    // w4 is the one in-window post with no resolved date. It is counted in
    // totalPosts (it is a real post) but excluded from the weekday chart, and the
    // exclusion is surfaced so the UI can disclose it rather than hide it.
    expect(a.totalPosts).toBe(4);
    expect(a.weekdayUndatedPosts).toBe(1);
    // ⚠️ AND IT IS NOT COUNTED AS COARSE. w4 has no date at all; the coarse count
    // is for posts that DO have one. Merging them would report the same number
    // under a sentence that says something different and untrue.
    expect(a.weekdayCoarsePosts).toBe(0);
    expect(a.weekdayPlacedPosts).toBe(3);
  });

  it("gives a weekday with no posts a genuine zero", () => {
    const a = buildDashboardAnalytics(WEEKDAY_ROWS, { range: R30, now: NOW });
    // Sunday saw nothing — a real 0, distinct from a weekday we could not measure.
    expect(wk("Sun", a.impressionsByWeekday)).toBe(0);
    expect(wk("Mon", a.impressionsByWeekday)).toBe(0);
  });

  it("yields all-zero buckets when the window holds no datable posts", () => {
    // Every post in the window is hour-age (undated). There is nothing to place on
    // a weekday, so every bucket is 0 and the whole window is disclosed as excluded
    // — the chart's all-zero empty state still triggers, honestly this time.
    const undatedOnly: PostMetricsRow[] = [
      metricsRow({
        linkedin_post_id: "u1",
        estimated_post_date: null,
        post_age: "2h",
        impressions: 400,
        scraped_at: "2026-07-15T06:00:00.000Z",
      }),
      metricsRow({
        linkedin_post_id: "u2",
        estimated_post_date: null,
        post_age: "9h",
        impressions: 800,
        scraped_at: "2026-07-16T06:00:00.000Z",
      }),
    ];
    const a = buildDashboardAnalytics(undatedOnly, { range: R30, now: NOW });
    expect(a.impressionsByWeekday.every((d) => d.value === 0)).toBe(true);
    expect(a.totalPosts).toBe(2);
    expect(a.weekdayUndatedPosts).toBe(2);
  });

  it("aggregates the CURRENT window only, respecting the range filter", () => {
    // A Friday post from the prior window (2026-06-05) must not inflate Friday of
    // the current window's chart. Under 30d it is out of scope; only w3 (Jul 10,
    // Fri) counts, so Friday stays 500.
    const withPrior: PostMetricsRow[] = [
      ...WEEKDAY_ROWS,
      metricsRow({
        linkedin_post_id: "old",
        post_age: "1d",
        scraped_at: "2026-06-06T00:00:00.000Z",
        estimated_post_date: "2026-06-05",
        impressions: 9000,
      }),
    ];
    const a = buildDashboardAnalytics(withPrior, { range: R30, now: NOW });
    expect(wk("Fri", a.impressionsByWeekday)).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE AGGREGATE RATE IS IMPRESSION-WEIGHTED, AND MUST STAY THAT WAY.
//
// ⚠️ A rate over a SET of posts is a ratio of TOTALS — Σinteractions / Σimpressions
// — never the mean of the posts' individual rates. Averaging per-post rates gives
// a 12-impression post the same say as a 100,000-impression one, which is not
// what "engagement rate for this period" means to anybody reading it.
//
// This is pinned rather than merely commented because the temptation to "simplify"
// it into a mean is real, and the two agree on uniform fixtures — so a fixture
// with EVEN impressions would pass under both formulas and prove nothing.
// ─────────────────────────────────────────────────────────────────────────────
describe("the dashboard engagement rate is impression-weighted, not a mean of rates", () => {
  // Wildly uneven on purpose. Post A: 100,000 impressions, 1,000 interactions
  // → 1%. Post B: 10 impressions, 5 interactions → 50%.
  //
  //   weighted : (1000 + 5) / (100000 + 10) × 100 = 1.0049…  ≈ 1.0
  //   mean     : (1 + 50) / 2                     = 25.5
  //
  // A 25× gap. Nothing subtle can hide in it.
  const LOPSIDED = [
    metricsRow({
      linkedin_post_id: "whale",
      impressions: 100_000,
      interactions: 1_000,
      scraped_at: "2026-07-15T00:00:00.000Z",
    }),
    metricsRow({
      linkedin_post_id: "minnow",
      impressions: 10,
      interactions: 5,
      scraped_at: "2026-07-15T00:00:00.000Z",
    }),
  ];

  it("reports the ratio of TOTALS, not the average of the two posts' rates", () => {
    const a = buildDashboardAnalytics(LOPSIDED, { range: R30, now: NOW });

    expect(a.engagement.value).toBeCloseTo(1.0, 1);
    // Spelled out so the failure message names the defect rather than a number:
    // 25.5 is what the mean-of-rates formula returns.
    expect(a.engagement.value).not.toBeCloseTo(25.5, 1);
  });

  it("lets one high-impression post dominate, which is the whole point", () => {
    // Swapping the SMALL post's rate must barely move the figure. Under a mean
    // of rates this jumps by ~25 points; weighted, it moves by ~0.005.
    const quieterMinnow = [
      LOPSIDED[0]!,
      metricsRow({
        linkedin_post_id: "minnow",
        impressions: 10,
        interactions: 0,
        scraped_at: "2026-07-15T00:00:00.000Z",
      }),
    ];

    const before = buildDashboardAnalytics(LOPSIDED, { range: R30, now: NOW }).engagement.value;
    const after = buildDashboardAnalytics(quieterMinnow, { range: R30, now: NOW }).engagement.value;

    expect(Math.abs(after - before)).toBeLessThan(0.5);
  });

  it("reports 0 — not NaN — when the period has impressions of zero", () => {
    const noReach = [
      metricsRow({
        linkedin_post_id: "a",
        impressions: 0,
        interactions: 0,
        scraped_at: "2026-07-15T00:00:00.000Z",
      }),
    ];

    const a = buildDashboardAnalytics(noReach, { range: R30, now: NOW });

    expect(a.engagement.value).toBe(0);
    expect(Number.isNaN(a.engagement.value)).toBe(false);
  });
});

describe("getDashboardAnalytics (seam → public.client_posts)", () => {
  beforeEach(() => {
    postsState.rows = [];
    postsState.error = null;
    postsState.eqCalls = [];
    postsState.schemaCalls = [];
    postsState.fromCalls = [];
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registry = [];
    postsState.uploads = [];
  });

  it("reads the APP-OWNED view and returns a well-formed analytics", async () => {
    postsState.rows = ROWS;
    const a = await getDashboardAnalytics({ range: R30 });

    // ⚠️ ASSERTS THE APP-OWNED SOURCE BY NAME, AND THAT `bi` IS NEVER REACHED.
    // This line read `expect(postsState.schemaCalls).toContain("bi")` until ADR 0010
    // repointed the seam — it pinned the source the app was supposed to stop
    // using. The empty-schemaCalls half is the tripwire: `toContain` alone would
    // still pass if some other read quietly went back to `bi`.
    expect(postsState.fromCalls).toContain("client_posts");
    expect(postsState.schemaCalls).toEqual([]);
    expect(postsState.fromCalls).toContain("client_posts");
    expect(a.hero.label).toBe("Impressions");
    expect(a.kpis.map((k) => k.label)).toEqual(["Posts", "Likes", "Comments", "Shares", "Saves"]);
    expect(Array.isArray(a.impressionsSeries)).toBe(true);
    expect(Array.isArray(a.recentPosts)).toBe(true);
  });

  it("filters by client_id when provided", async () => {
    postsState.rows = ROWS;
    await getDashboardAnalytics({ range: R30, clientId: "c1" });
    expect(postsState.eqCalls).toContainEqual(["client_id", "c1"]);
  });

  it("returns the empty state for zero rows (available, just no data)", async () => {
    postsState.rows = [];
    const a = await getDashboardAnalytics({ range: R7 });
    expect(a.recentPosts).toEqual([]);
    expect(a.totalPosts).toBe(0);
    expect(a.unavailable).toBeFalsy(); // genuinely empty, not an outage
  });

  // ── the read's lower bound ─────────────────────────────────────────────────
  // ⚠️ LOWER BOUND ONLY, ALWAYS. The `.or(… estimated_post_date.is.null)` clause
  // deliberately keeps null-dated hour-age posts so `effectiveMs` can window
  // them by `scraped_at`; an UPPER bound would interact badly with it. Rows past
  // the window's end are filtered in memory by `currentWindow`, which is cheap.

  it("bounds the read at the PRIOR window's start, so the baseline is readable", async () => {
    postsState.rows = ROWS;
    await getDashboardAnalytics({ range: R30 });

    // ⚠️ THIS BOUND MOVED FORWARD BY ONE DAY ON 2026-08-13, WITH THE PRESET DAY
    // SNAP. It used to read `now − 2 × 30d`, mirroring the old rolling window.
    // A preset is now N whole UTC days INCLUDING today, so the current window
    // opens 29 days before today's midnight and the prior one opens 30 days
    // before that — 59, not 60. Derived here from the rule rather than from
    // `resolveWindow`, so this still cross-checks the implementation instead of
    // restating it.
    const today = new Date();
    const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const bound = new Date(todayStart - (2 * 30 - 1) * 86_400_000).toISOString().slice(0, 10);
    expect(postsState.orCalls).toHaveLength(1);
    expect(postsState.orCalls[0]).toBe(
      `estimated_post_date.gte.${bound},estimated_post_date.is.null`,
    );
  });

  it("bounds a CUSTOM window at its own prior start, not at now minus a span", async () => {
    // A window that ended in the past would read nothing at all under the old
    // `now − 2 × span` bound: both its windows sit further back than that.
    postsState.rows = ROWS;
    await getDashboardAnalytics({
      range: { kind: "custom", startDay: "2026-06-12", endDay: "2026-07-29" },
    });

    // 12 Jun 2026 minus its own 48-day span = 25 Apr 2026.
    expect(postsState.orCalls[0]).toBe(
      "estimated_post_date.gte.2026-04-25,estimated_post_date.is.null",
    );
  });

  it("DROPS THE BOUND ENTIRELY for all time — there is no floor to apply", async () => {
    postsState.rows = ROWS;
    await getDashboardAnalytics({ range: ALL });

    // Not a bound at the epoch, and not a bound at -Infinity stringified into a
    // date: no clause at all.
    expect(postsState.orCalls).toEqual([]);
  });

  it("never adds an UPPER bound to the query", async () => {
    postsState.rows = ROWS;
    for (const range of [R7, R30, ALL]) {
      postsState.orCalls = [];
      await getDashboardAnalytics({ range });
      for (const filter of postsState.orCalls) {
        expect(filter, JSON.stringify(range)).not.toMatch(/\.lte\.|\.lt\./);
      }
    }
  });

  it("flags unavailable (does not throw) when the posts query errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    postsState.error = { message: "permission denied for schema bi" };

    const a = await getDashboardAnalytics({ range: R30 });

    expect(a.unavailable).toBe(true); // distinct from "no data"
    expect(a.recentPosts).toEqual([]);
    expect(a.totalPosts).toBe(0);
    expect(a.hero.value).toBe(0);
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE THIRD REAPPEARANCE OF THE DEFECT `paged.ts` WAS EXTRACTED TO PREVENT.
//
// The dashboard read issued a bare `.select()` — no `.range()`, no ordering — so
// above PostgREST's 1000-row cap it returned 1000 rows and a 200. Every KPI, the
// engagement figure, both charts and `lastSync` were then computed from an
// arbitrary subset, and the screen presented them as totals.
// ─────────────────────────────────────────────────────────────────────────────
describe("the dashboard read is paged — every post, not the first 1000", () => {
  /** Dated relative to the real clock: `getDashboardAnalytics` builds its own `now`. */
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  beforeEach(() => {
    postsState.rows = [];
    postsState.error = null;
    postsState.eqCalls = [];
    postsState.schemaCalls = [];
    postsState.fromCalls = [];
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registry = [];
    postsState.uploads = [];
  });

  it("counts EVERY post past the 1000-row response cap, not just the first page", async () => {
    postsState.rows = Array.from({ length: PAGE_SIZE + 200 }, (_, i) =>
      metricsRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow, impressions: 10 }),
    );

    const a = await getDashboardAnalytics({ range: R30 });

    expect(a.totalPosts).toBe(PAGE_SIZE + 200);
    // Nailed down explicitly: 1000 is precisely the number the defect produced.
    expect(a.totalPosts).not.toBe(PAGE_SIZE);
  });

  it("sums impressions across every page, so the hero KPI is not short either", async () => {
    postsState.rows = Array.from({ length: PAGE_SIZE + 200 }, (_, i) =>
      metricsRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow, impressions: 10 }),
    );

    const a = await getDashboardAnalytics({ range: R30 });

    expect(a.hero.value).toBe((PAGE_SIZE + 200) * 10);
  });

  // ⚠️ WITHOUT A STABLE ORDER THE ROW SET IS SILENTLY WRONG, NOT MERELY SHORT.
  // Pages 1..n are issued concurrently; with no total order the database may
  // return a row in two ranges or in neither.
  it("applies a stable order so concurrent page ranges cannot overlap or skip", async () => {
    postsState.rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      metricsRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow }),
    );

    await getDashboardAnalytics({ range: R30 });

    expect(postsState.orderCalls).toContainEqual(["linkedin_post_id", { ascending: true }]);
  });

  // ⚠️ TWO DIFFERENT FACTS. "Meaningless" and "real but incomplete" must not
  // collapse into one flag — the screen says something different for each.
  it("flags TRUNCATED, not unavailable, when the read hits the page cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    postsState.rows = Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, (_, i) =>
      metricsRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow }),
    );

    const a = await getDashboardAnalytics({ range: R30 });

    // ⚠️ THE TWO NUMBERS MUST DIFFER. "Incomplete" is a warning; "50,000 of
    // 50,001" is actionable, and only the pager knows the second one.
    expect(a.truncation).toEqual({ read: MAX_PAGES * PAGE_SIZE, total: MAX_PAGES * PAGE_SIZE + 1 });
    expect(a.truncation!.total).not.toBe(a.truncation!.read);
    // The rows are REAL — just incomplete. Not an outage.
    expect(a.unavailable).toBeFalsy();
    expect(a.totalPosts).toBe(MAX_PAGES * PAGE_SIZE);

    warn.mockRestore();
  });

  it("flags UNAVAILABLE, not truncated, when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    postsState.error = { message: "permission denied for schema bi" };

    const a = await getDashboardAnalytics({ range: R30 });

    expect(a.unavailable).toBe(true);
    expect(a.truncation).toBeFalsy();

    warn.mockRestore();
  });

  it("flags neither on a complete read", async () => {
    postsState.rows = ROWS;

    const a = await getDashboardAnalytics({ range: R30 });

    expect(a.unavailable).toBeFalsy();
    expect(a.truncation).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CROSS-CLIENT COMPARISON.
//
// ⚠️ A COMPARISON'S INTEGRITY LIVES IN ITS DENOMINATORS. Every figure here is a
// normalised one, so a Client with no posts, a Client with no impressions and a
// Client whose followers were never recorded must each produce "not applicable"
// rather than a 0 that reads as a measured failure to perform.
//
// ⚠️ AND IT PARTITIONS THE SAME WINDOW THE KPI CARDS REPORT. If it re-derived
// its own, the table would disagree with the cards directly above it.
// ─────────────────────────────────────────────────────────────────────────────
describe("the client comparison", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const outOfWindow = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);

  const upload = (
    clientId: string,
    createdAt: string,
    followerCount: number | null,
    connectionsCount: number | null = null,
  ) => ({
    id: `u-${clientId}-${createdAt}`,
    clientId,
    sourceType: "csv" as const,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount,
    connectionsCount,
    createdAt,
  });

  beforeEach(() => {
    postsState.rows = [];
    postsState.error = null;
    postsState.eqCalls = [];
    postsState.schemaCalls = [];
    postsState.fromCalls = [];
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registryCalls = 0;
    postsState.uploadsCalls = 0;
    postsState.registry = [
      { id: "c1", name: "Bryan Wish" },
      { id: "c2", name: "Ada Lovelace" },
    ];
    postsState.uploads = [
      upload("c1", "2026-07-20T00:00:00.000Z", 10_000),
      upload("c2", "2026-07-20T00:00:00.000Z", 2_000),
    ];
  });

  // ⚠️ THE PARITY GATE. Every post in the window is either attributed to a
  // registry Client or counted as unattributed — never silently dropped. A
  // reader must be able to reconcile the table against the post count above it.
  it("accounts for EVERY post in the window: rows + unattributed === totalPosts", async () => {
    postsState.rows = [
      metricsRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
      metricsRow({ linkedin_post_id: "b", client_id: "c1", estimated_post_date: inWindow }),
      metricsRow({ linkedin_post_id: "c", client_id: "c2", estimated_post_date: inWindow }),
      // ⚠️ A REAL UNATTRIBUTED POST. Attribution happens downstream (ADR 0009),
      // so a client_id matching nobody in the roster is expected, not a bug. A
      // parity test whose unattributed term is always 0 proves nothing.
      metricsRow({ linkedin_post_id: "d", client_id: "ghost", estimated_post_date: inWindow }),
    ];

    const a = await getDashboardAnalytics({ range: R30 });
    const c = a.comparison!;

    expect(c.unattributedPosts).toBe(1);
    expect(c.rows.reduce((s, r) => s + r.posts, 0) + c.unattributedPosts).toBe(a.totalPosts);
    expect(a.totalPosts).toBe(4);
  });

  it("excludes posts outside the window from both the rows and the unattributed count", async () => {
    postsState.rows = [
      metricsRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
      metricsRow({ linkedin_post_id: "old", client_id: "c1", estimated_post_date: outOfWindow }),
      metricsRow({
        linkedin_post_id: "oldghost",
        client_id: "ghost",
        estimated_post_date: outOfWindow,
      }),
    ];

    const a = await getDashboardAnalytics({ range: R30 });
    const c = a.comparison!;

    expect(a.totalPosts).toBe(1);
    expect(c.rows.find((r) => r.clientId === "c1")!.posts).toBe(1);
    expect(c.unattributedPosts).toBe(0);
    expect(c.rows.reduce((s, r) => s + r.posts, 0) + c.unattributedPosts).toBe(a.totalPosts);
  });

  // ⚠️ A CLIENT WHO PUBLISHED NOTHING IS A FINDING. Dropping the row would make
  // the book look smaller and better than it is.
  it("keeps a Client with no posts in range, as a genuine 0 with nothing derived", async () => {
    postsState.rows = [
      metricsRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;
    const quiet = c.rows.find((r) => r.clientId === "c2")!;

    expect(quiet.posts).toBe(0);
    // ⚠️ NOT 0%. A Client who did not post has no engagement rate; a 0 would
    // claim a measured failure to engage.
    expect(quiet.engagementRate).toBeNull();
    expect(quiet.avgImpressions).toBeNull();
    expect(quiet.interactionsPer1K).toBeNull();
  });

  it("reports the engagement rate as null, never 0, when a Client had no impressions", async () => {
    postsState.rows = [
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 0,
        interactions: 0,
      }),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;
    const row = c.rows.find((r) => r.clientId === "c1")!;

    expect(row.posts).toBe(1); // it DID post — that part is measured
    expect(row.engagementRate).toBeNull();
    expect(row.avgImpressions).toBe(0); // a measured zero: it posted, got no reach
  });

  // ⚠️ ONE ENGAGEMENT-RATE DEFINITION. Impression-weighted, via `weightedRate`
  // — never the mean of the posts' individual rates.
  it("computes the engagement rate impression-weighted, not as a mean of per-post rates", async () => {
    postsState.rows = [
      // 1 interaction / 10 impressions = 10%
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 10,
        interactions: 1,
      }),
      // 10 interactions / 1000 impressions = 1%
      metricsRow({
        linkedin_post_id: "b",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 1000,
        interactions: 10,
      }),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    // Weighted: 11 / 1010 = 1.1%. A mean of rates would give 5.5%.
    expect(c.rows.find((r) => r.clientId === "c1")!.engagementRate).toBeCloseTo(1.1, 1);
  });

  it("averages impressions per post, and reports null rather than 0 when there are none", async () => {
    postsState.rows = [
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 300,
      }),
      metricsRow({
        linkedin_post_id: "b",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 100,
      }),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows.find((r) => r.clientId === "c1")!.avgImpressions).toBe(200);
    expect(c.rows.find((r) => r.clientId === "c2")!.avgImpressions).toBeNull();
  });
});

describe("the comparison's follower-normalised figure", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const upload = (
    clientId: string,
    createdAt: string,
    followerCount: number | null,
    connectionsCount: number | null = null,
  ) => ({
    id: `u-${clientId}-${createdAt}`,
    clientId,
    sourceType: "csv" as const,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount,
    connectionsCount,
    createdAt,
  });

  beforeEach(() => {
    postsState.rows = [
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        interactions: 500,
        impressions: 1000,
      }),
    ];
    postsState.error = null;
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registryCalls = 0;
    postsState.uploadsCalls = 0;
    postsState.registry = [{ id: "c1", name: "Bryan Wish" }];
    postsState.uploads = [];
  });

  it("takes the MOST RECENT recorded follower count, skipping uploads that recorded none", async () => {
    postsState.uploads = [
      // Newest, but recorded nothing — skipped, never read as a drop to zero.
      upload("c1", "2026-07-22T00:00:00.000Z", null),
      upload("c1", "2026-07-20T00:00:00.000Z", 10_000),
      upload("c1", "2026-06-01T00:00:00.000Z", 4_000),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.followers).toBe(10_000);
    // 500 interactions / 10,000 followers × 1000 = 50
    expect(c.rows[0]!.interactionsPer1K).toBeCloseTo(50, 5);
  });

  it("reports followers and the per-1,000 rate as null when nothing was ever recorded", async () => {
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", null)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.followers).toBeNull();
    expect(c.rows[0]!.interactionsPer1K).toBeNull();
  });

  // ⚠️ A RATE PER NOTHING IS UNDEFINED — not Infinity, and not zero.
  it("reports the per-1,000 rate as null when the follower count is a recorded 0", async () => {
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", 0)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    // The 0 itself is a real measurement and is reported.
    expect(c.rows[0]!.followers).toBe(0);
    expect(c.rows[0]!.interactionsPer1K).toBeNull();
    expect(Number.isFinite(c.rows[0]!.interactionsPer1K as number)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ A RAW COUNT, NOT A NORMALISED RATE. Connections carries NO per-1,000 figure:
// the derived column was removed deliberately, and the follower/connection
// asymmetry that leaves behind is intentional. What survives is the count itself
// — optional at capture, so "no figure" is the ordinary state, and a Client whose
// count was never recorded must read as unmeasured rather than as a zero.
// ─────────────────────────────────────────────────────────────────────────────
describe("the comparison's raw connection count", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const upload = (
    clientId: string,
    createdAt: string,
    followerCount: number | null,
    connectionsCount: number | null = null,
  ) => ({
    id: `u-${clientId}-${createdAt}`,
    clientId,
    sourceType: "csv" as const,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount,
    connectionsCount,
    createdAt,
  });

  beforeEach(() => {
    postsState.rows = [
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        interactions: 500,
        impressions: 1000,
      }),
    ];
    postsState.error = null;
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registryCalls = 0;
    postsState.uploadsCalls = 0;
    postsState.registry = [{ id: "c1", name: "Bryan Wish" }];
    postsState.uploads = [];
  });

  it("takes the MOST RECENT recorded connection count, skipping uploads that recorded none", async () => {
    postsState.uploads = [
      // Newest, but carried no connection count — skipped, never a drop to zero.
      upload("c1", "2026-07-22T00:00:00.000Z", 1_000, null),
      upload("c1", "2026-07-20T00:00:00.000Z", 1_000, 5_000),
      upload("c1", "2026-06-01T00:00:00.000Z", 1_000, 2_000),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.connections).toBe(5_000);
  });

  it("reports connections as null when nothing was ever recorded", async () => {
    // The DEFAULT for every client today: a full follower history, no connections.
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", 10_000, null)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.connections).toBeNull();
    // ⚠️ AND THE FOLLOWER COLUMNS ARE UNTOUCHED — INCLUDING ITS PER-1K RATE. Only
    // the CONNECTION side lost its derived figure; followers keep theirs.
    expect(c.rows[0]!.followers).toBe(10_000);
    expect(c.rows[0]!.interactionsPer1K).toBeCloseTo(50, 5);
  });

  it("never lets a follower count stand in for a missing connection count", async () => {
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", 10_000, null)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.connections).not.toBe(10_000);
    expect(c.rows[0]!.connections).toBeNull();
  });

  it("keeps a recorded 0 as 0 — a measured zero is a fact, not a gap", async () => {
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", null, 0)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.connections).toBe(0);
    expect(c.rows[0]!.connections).not.toBeNull();
  });

  it("reports the count for a Client that posted nothing — it does not depend on posting", async () => {
    // ⚠️ WHY THE RAW COUNT SURVIVES WHERE THE RATE DID NOT. A rate needs a
    // numerator and a sample size; a captured count needs neither, so a silent
    // Client still has a real, reportable connection figure.
    postsState.rows = [];
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", null, 5_000)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.rows[0]!.posts).toBe(0);
    expect(c.rows[0]!.connections).toBe(5_000);
  });

  it("exposes EXACTLY these figures — connections is raw, with no derived twin", async () => {
    // ⚠️ THE SUBTRACTION, PINNED AS A WHITELIST RATHER THAN A BLACKLIST. Naming
    // every key that may exist catches ANY derived figure someone adds back —
    // not just the per-1,000-connections one that was deliberately removed —
    // while leaving the FOLLOWER rate in place, because that asymmetry is intended.
    postsState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", 1_000, 5_000)];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(Object.keys(c.rows[0]!).sort()).toEqual([
      "avgImpressions",
      "clientId",
      "clientName",
      "connections",
      "engagementRate",
      "followers",
      "interactionsPer1K",
      "posts",
    ]);
    expect(Object.keys(c.medians).sort()).toEqual([
      "avgImpressions",
      "connections",
      "engagementRate",
      "followers",
      "interactionsPer1K",
    ]);
  });

  it("carries a connections median with its own sample size", async () => {
    postsState.registry = [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
    ];
    postsState.uploads = [
      upload("c1", "2026-07-20T00:00:00.000Z", 1_000, 5_000),
      // c2 recorded a follower count but no connections — it contributes to the
      // followers median and NOT to the connections one.
      upload("c2", "2026-07-20T00:00:00.000Z", 2_000, null),
    ];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.medians.connections.value).toBe(5_000);
    expect(c.medians.connections.clients).toBe(1);
    expect(c.medians.followers.clients).toBe(2);
  });
});

describe("the comparison's medians carry their sample size", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  beforeEach(() => {
    postsState.error = null;
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registryCalls = 0;
    postsState.uploadsCalls = 0;
    postsState.uploads = [];
    postsState.registry = [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
      // Posted nothing: contributes no value to any median.
      { id: "c4", name: "D" },
    ];
    postsState.rows = [
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 100,
      }),
      metricsRow({
        linkedin_post_id: "b",
        client_id: "c2",
        estimated_post_date: inWindow,
        impressions: 200,
      }),
      metricsRow({
        linkedin_post_id: "c",
        client_id: "c3",
        estimated_post_date: inWindow,
        impressions: 300,
      }),
    ];
  });

  // ⚠️ A MEDIAN OVER THREE CLIENTS AND A MEDIAN OVER THIRTY ARE DIFFERENT
  // CLAIMS. The count is what lets the UI say which one it is showing.
  it("computes each median only over Clients where the figure exists, and says how many", async () => {
    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.medians.avgImpressions.value).toBe(200);
    // Three, NOT four — the silent Client has no average to contribute.
    expect(c.medians.avgImpressions.clients).toBe(3);
  });

  it("reports a null median with a zero count when no Client has the figure", async () => {
    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    // No uploads at all, so nobody has a follower count.
    expect(c.medians.followers.value).toBeNull();
    expect(c.medians.followers.clients).toBe(0);
  });
});

describe("the comparison is only built where it is meaningful", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  beforeEach(() => {
    postsState.rows = [
      metricsRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
    ];
    postsState.error = null;
    postsState.orderCalls = [];
    postsState.orCalls = [];
    postsState.registryCalls = 0;
    postsState.uploadsCalls = 0;
    postsState.registry = [{ id: "c1", name: "Bryan Wish" }];
    postsState.uploads = [];
  });

  // ⚠️ AND IT DOES NOT PAY FOR WHAT IT WILL NOT USE.
  it("is null for a single-client dashboard, and issues neither extra read", async () => {
    const a = await getDashboardAnalytics({ range: R30, clientId: "c1" });

    expect(a.comparison).toBeNull();
    expect(postsState.registryCalls).toBe(0);
    expect(postsState.uploadsCalls).toBe(0);
  });

  it("is built, and reads both sources, in the all-clients state", async () => {
    const a = await getDashboardAnalytics({ range: R30 });

    expect(a.comparison).not.toBeNull();
    expect(postsState.registryCalls).toBe(1);
    expect(postsState.uploadsCalls).toBe(1);
  });

  // ⚠️ THE DASHBOARD READS THE CLIENT BOOK ONCE PER REQUEST. The page reads the
  // registry for its filter and hands the SAME read in; the comparison must reuse
  // it rather than issuing a second read of the same table. Without this the app's
  // most-hit route reads `public.clients` twice on every all-clients render.
  it("reuses a caller-supplied registry instead of reading it a second time", async () => {
    const a = await getDashboardAnalytics({
      range: R30,
      registry: Promise.resolve([{ id: "c1", name: "Bryan Wish" }]),
    });

    // Still built — the passed roster is a real answer, used exactly as its own
    // read would have been.
    expect(a.comparison).not.toBeNull();
    // ...but NOT re-read. The uploads read is still the comparison's own.
    expect(postsState.registryCalls).toBe(0);
    expect(postsState.uploadsCalls).toBe(1);
  });

  it("still reads its own registry when the caller supplies none", async () => {
    // The fallback the other callers and every existing test rely on.
    await getDashboardAnalytics({ range: R30 });
    expect(postsState.registryCalls).toBe(1);
  });

  it("honours a caller-supplied registry that FAILED — comparison unavailable, still no re-read", async () => {
    const c = (await getDashboardAnalytics({ range: R30, registry: Promise.resolve(null) }))
      .comparison!;

    // A passed-in null is a failed roster read; the comparison is unavailable and
    // the service does not fall back to a second read that would likely fail too.
    expect(c.unavailable).toBe(true);
    expect(postsState.registryCalls).toBe(0);
  });

  it("marks the comparison unavailable when the registry read failed — not empty", async () => {
    postsState.registry = null;

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.unavailable).toBe(true);
    expect(c.rows).toEqual([]);
  });

  // ⚠️ REPLACES an earlier test that asserted `c.unavailable === true` when the
  // uploads read failed — that WAS the defect. Uploads feed only two of the six
  // columns; blanking the whole table to hide them threw away three readable
  // ones. The comparison is now BUILT, and only the follower columns degrade.
  it("BUILDS the comparison when the roster reads but uploads fail — only follower columns degrade", async () => {
    postsState.rows = [
      metricsRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 1000,
        interactions: 50,
      }),
    ];
    postsState.registry = [{ id: "c1", name: "Bryan Wish" }];
    postsState.uploads = null; // the upload read FAILED

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    // Built, not blanked — the whole point of the fix.
    expect(c.unavailable).toBe(false);
    expect(c.rows).toHaveLength(1);

    const clientRow = c.rows[0]!;
    // The three post-derived columns are real, from the post read and the roster.
    expect(clientRow.posts).toBe(1);
    expect(clientRow.avgImpressions).toBe(1000);
    expect(clientRow.engagementRate).not.toBeNull();
    // The two follower-derived columns em-dash themselves for EVERY row — the
    // existing per-row gate makes `interactionsPer1K` null once `followers` is.
    expect(clientRow.followers).toBeNull();
    expect(clientRow.interactionsPer1K).toBeNull();
    // ...and the comparison SAYS the followers could not be read, so the reader
    // can tell a failed upload read from a client that simply has no follower
    // figure — the two would otherwise render identically.
    expect(c.followersUnavailable).toBe(true);
    // ⚠️ THE CONNECTIONS COLUMN DEGRADES THE SAME WAY, AND SAYS SO SEPARATELY. It
    // comes from the same failed read, but "could not be read" has to be sayable
    // per column — otherwise a blank Connections column is indistinguishable from
    // the (very common) case where nobody recorded one.
    expect(clientRow.connections).toBeNull();
    expect(c.connectionsUnavailable).toBe(true);
  });

  it("does not claim followers are unavailable when the uploads read SUCCEEDED", async () => {
    postsState.registry = [{ id: "c1", name: "Bryan Wish" }];
    postsState.uploads = []; // read ok, just no follower rows

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    // Every row still em-dashes followers, but that is "no follower figure", NOT
    // an outage — the flag must stay false so the panel does not cry wolf.
    expect(c.followersUnavailable).toBe(false);
  });

  it("does not claim connections are unavailable when the uploads read SUCCEEDED", async () => {
    // ⚠️ THE CRY-WOLF CASE THAT MATTERS MOST. Connections is optional, so an
    // all-blank column is the NORMAL state. Flagging it as an outage would put a
    // permanent false alarm on the dashboard.
    postsState.registry = [{ id: "c1", name: "Bryan Wish" }];
    postsState.uploads = [];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.connectionsUnavailable).toBe(false);
  });

  it("is available and empty — not unavailable — when the registry is genuinely empty", async () => {
    postsState.registry = [];

    const c = (await getDashboardAnalytics({ range: R30 })).comparison!;

    expect(c.unavailable).toBe(false);
    expect(c.rows).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE GRANULARITY RULE. A resolved `estimated_post_date` is a full timestamp
// whatever produced it, so a "4d" post and a "4m" post look equally day-exact and
// are not: the month post was SNAPPED to the 1st and the week post landed on the
// scrape's own weekday. A bucket at granularity G may only contain posts whose
// precision is at least as fine as G, and the posts kept out for coarseness are a
// THIRD state — counted and disclosed, never folded into "undated", which would
// tell a reader the date is missing when it is merely too blunt for this chart.
// ─────────────────────────────────────────────────────────────────────────────

describe("placePost — three states, never two", () => {
  it("places a day-age post at every granularity", () => {
    const row = metricsRow({ post_age: "4d", estimated_post_date: "2026-07-10T00:00:00.000Z" });
    expect(placePost(row, "day")).toEqual({ state: "placed", ms: Date.parse("2026-07-10") });
    expect(placePost(row, "week").state).toBe("placed");
    expect(placePost(row, "month").state).toBe("placed");
  });

  it("⚠️ refuses a week-age post at DAY granularity, and admits it at week", () => {
    const row = metricsRow({ post_age: "3w", estimated_post_date: "2026-07-10T00:00:00.000Z" });
    expect(placePost(row, "day")).toEqual({ state: "too-coarse" });
    expect(placePost(row, "week").state).toBe("placed");
    expect(placePost(row, "month").state).toBe("placed");
  });

  it("⚠️ refuses a month-age post at day AND week granularity, and admits it at month", () => {
    const row = metricsRow({ post_age: "4m", estimated_post_date: "2026-05-01T00:00:00.000Z" });
    expect(placePost(row, "day")).toEqual({ state: "too-coarse" });
    expect(placePost(row, "week")).toEqual({ state: "too-coarse" });
    expect(placePost(row, "month").state).toBe("placed");
  });

  it("⚠️ treats a YEAR age as month-grained — its day is the scrape's", () => {
    const row = metricsRow({ post_age: "1y", estimated_post_date: "2025-07-15T00:00:00.000Z" });
    expect(placePost(row, "day")).toEqual({ state: "too-coarse" });
    expect(placePost(row, "week")).toEqual({ state: "too-coarse" });
    expect(placePost(row, "month").state).toBe("placed");
  });

  it("reports UNDATED — not too-coarse — when there is no resolved date at all", () => {
    // ⚠️ THE TWO MUST NOT MERGE. "we could not date this post" and "we dated it,
    // but only to the month" are different facts and get different sentences.
    const row = metricsRow({ post_age: "5h", estimated_post_date: null });
    expect(placePost(row, "day")).toEqual({ state: "undated" });
    expect(placePost(row, "month")).toEqual({ state: "undated" });
  });

  it("⚠️ treats a dated row whose age cannot be read as MONTH-grained, never finer", () => {
    // Reachable only for rows loaded by the one-time migration, whose date came
    // from the previous analytics layer while the age text came from the scrape:
    // that layer dated hour-ages this resolver refuses. Month is the COARSEST
    // datable granularity, so such a row can never enter a finer bucket — and the
    // month charts, which count it today, keep counting it.
    const row = metricsRow({ post_age: "23h", estimated_post_date: "2026-07-10T00:00:00.000Z" });
    expect(placePost(row, "day")).toEqual({ state: "too-coarse" });
    expect(placePost(row, "month").state).toBe("placed");

    const noAge = metricsRow({ post_age: null, estimated_post_date: "2026-07-10T00:00:00.000Z" });
    expect(placePost(noAge, "day")).toEqual({ state: "too-coarse" });
    expect(placePost(noAge, "month").state).toBe("placed");
  });
});

describe("the weekday chart admits only day-precision posts", () => {
  // Four posts, one per precision, all inside the 30-day window. Weekdays (UTC):
  // 2026-07-10 Fri · 2026-07-08 Wed · 2026-07-01 Wed.
  const MIXED: PostMetricsRow[] = [
    metricsRow({
      linkedin_post_id: "day",
      post_age: "6d",
      estimated_post_date: "2026-07-10T00:00:00.000Z",
      impressions: 900,
      scraped_at: "2026-07-16T00:00:00.000Z",
    }),
    metricsRow({
      linkedin_post_id: "week",
      post_age: "1w",
      estimated_post_date: "2026-07-08T00:00:00.000Z",
      impressions: 100,
      scraped_at: "2026-07-15T00:00:00.000Z",
    }),
    metricsRow({
      linkedin_post_id: "month",
      post_age: "1m",
      estimated_post_date: "2026-07-01T00:00:00.000Z",
      impressions: 100,
      scraped_at: "2026-07-15T00:00:00.000Z",
    }),
    metricsRow({
      linkedin_post_id: "hour",
      post_age: "5h",
      estimated_post_date: null,
      impressions: 100,
      scraped_at: "2026-07-16T06:00:00.000Z",
    }),
  ];

  const wkOf = (a: ReturnType<typeof buildDashboardAnalytics>) =>
    Object.fromEntries(a.impressionsByWeekday.map((d) => [d.label, d.value]));

  it("⚠️ MUTATION PROOF — the week-age and month-age posts do not reach a weekday", () => {
    const a = buildDashboardAnalytics(MIXED, { range: R30, now: NOW });
    // Only the "6d" post is averaged. Both coarse posts land on a Wednesday if
    // their timestamps are trusted, so a Wed of 100 is the signature of the bug.
    expect(wkOf(a).Fri).toBe(900);
    expect(wkOf(a).Wed).toBe(0);
  });

  it("counts the coarse posts separately from the undated one", () => {
    const a = buildDashboardAnalytics(MIXED, { range: R30, now: NOW });
    expect(a.weekdayPlacedPosts).toBe(1);
    expect(a.weekdayCoarsePosts).toBe(2);
    expect(a.weekdayUndatedPosts).toBe(1);
  });

  it("⚠️ accounts for EVERY in-window post — the three states partition the total", () => {
    const a = buildDashboardAnalytics(MIXED, { range: R30, now: NOW });
    expect(a.weekdayPlacedPosts + a.weekdayCoarsePosts + a.weekdayUndatedPosts).toBe(a.totalPosts);
  });
});
