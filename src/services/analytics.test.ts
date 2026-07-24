import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the Supabase server client + cookies so nothing hits the DB. ─
const { biState } = vi.hoisted(() => ({
  biState: {
    rows: [] as unknown[],
    error: null as { message: string } | null,
    eqCalls: [] as unknown[][],
    schemaCalls: [] as string[],
    fromCalls: [] as string[],
    orderCalls: [] as unknown[][],
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
 * The previous version returned `biState.rows` wholesale however the query was
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    schema: (s: string) => {
      biState.schemaCalls.push(s);
      return {
        from: (t: string) => {
          biState.fromCalls.push(t);
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
            biState.eqCalls.push(a);
            return chain;
          };
          chain.or = () => chain;
          chain.order = (...a: unknown[]) => {
            biState.orderCalls.push(a);
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
                if (biState.error) return { data: null, error: biState.error, count: null };
                return {
                  data: biState.rows.slice(from, to + 1),
                  error: null,
                  count: wantsCount ? biState.rows.length : null,
                };
              })
              .then(resolve, reject);
          return chain;
        },
      };
    },
  }),
}));

vi.mock("@/services/clients", () => ({
  listClientRegistry: () => {
    biState.registryCalls += 1;
    return Promise.resolve(biState.registry);
  },
}));
vi.mock("@/services/uploads", () => ({
  listAllUploads: () => {
    biState.uploadsCalls += 1;
    return Promise.resolve(biState.uploads);
  },
}));

import { MAX_PAGES, PAGE_SIZE } from "@/lib/supabase/paged";

import {
  buildDashboardAnalytics,
  effectiveMs,
  getDashboardAnalytics,
  type BiPostRow,
} from "./analytics";

function biRow(over: Partial<BiPostRow>): BiPostRow {
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

// Two current-window posts (Jul), one prior-window (May), one hour-age (null date).
const ROWS: BiPostRow[] = [
  biRow({
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
  biRow({
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
  biRow({
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
  biRow({
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
    expect(effectiveMs(biRow({ estimated_post_date: "2026-07-10" }))).toBe(
      Date.parse("2026-07-10"),
    );
  });

  it("falls back to scraped_at when estimated_post_date is null (hour-age posts)", () => {
    // Shay's resolver leaves estimated_post_date NULL for "23h"-style ages. The
    // scrape timestamp is the best available stand-in for when it was published.
    const row = biRow({ estimated_post_date: null, scraped_at: "2026-07-15T09:00:00.000Z" });
    expect(effectiveMs(row)).toBe(Date.parse("2026-07-15T09:00:00.000Z"));
  });

  it("falls back to scraped_at when estimated_post_date is unparseable", () => {
    const row = biRow({
      estimated_post_date: "not a date",
      scraped_at: "2026-07-15T09:00:00.000Z",
    });
    expect(effectiveMs(row)).toBe(Date.parse("2026-07-15T09:00:00.000Z"));
  });

  it("is null when neither date is usable", () => {
    expect(effectiveMs(biRow({ estimated_post_date: null, scraped_at: null }))).toBeNull();
    expect(effectiveMs(biRow({ estimated_post_date: null, scraped_at: "nonsense" }))).toBeNull();
  });
});

describe("hour-age posts (null estimated_post_date) are counted", () => {
  it("counts an hour-age post in totalPosts and the current window", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });

    // p4 has no estimated_post_date but was scraped 6h before NOW — it is a real
    // post from within the window and must not be silently dropped.
    expect(a.totalPosts).toBe(3);
    expect(a.hero.value).toBe(1700); // 1000 + 500 + p4's 200
  });

  it("includes an hour-age post's impressions in the series buckets", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    // The series must reconcile with the hero, including the hour-age row.
    expect(a.impressionsSeries.reduce((s, p) => s + p.value, 0)).toBe(1700);
  });

  it("still DISPLAYS post_age rather than a date for that post", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    const p4 = a.recentPosts.find((p) => p.id === "p4")!;
    // Counting it uses scraped_at; showing it must not — the scrape date is not
    // the publish date, and "5h" is the more honest label.
    expect(p4.date).toBe("5h");
  });

  it("still excludes a null-date post whose scrape falls outside the window", () => {
    // Proves the fallback is a real date test, not a blanket include.
    const stale = biRow({
      linkedin_post_id: "p5",
      estimated_post_date: null,
      post_age: "3h",
      impressions: 900,
      scraped_at: "2026-05-20T10:00:00.000Z", // prior window, not current
    });
    const a = buildDashboardAnalytics([...ROWS, stale], { range: "30d", now: NOW });

    expect(a.totalPosts).toBe(3); // unchanged — p5 is not in the current window
    expect(a.hero.value).toBe(1700);
  });
});

describe("buildDashboardAnalytics (pure)", () => {
  it("sums the current window and computes deltas vs the prior window", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });

    // Current window (Jul 1 + Jul 10 + the hour-age p4) impressions = 1700;
    // prior (May 20) = 600. p4 counts via its scraped_at — see `effectiveMs`.
    expect(a.hero).toEqual({ label: "Impressions", value: 1700, delta: 183, direction: "up" });
    expect(a.kpis.map((k) => k.label)).toEqual(["Likes", "Comments", "Shares", "Saves"]);
    const likes = a.kpis.find((k) => k.label === "Likes")!;
    expect(likes.value).toBe(150); // 100 + 40 + p4's 10
    expect(likes.direction).toBe("up");
    const saves = a.kpis.find((k) => k.label === "Saves")!;
    expect(saves.value).toBe(3); // grew from 0 in prior window
    expect(saves.direction).toBe("up");
  });

  it("computes the weighted engagement rate and a signed points delta", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    // interactions 177 / impressions 1700 * 100 = 10.41; prior 36/600*100 = 6.0.
    expect(a.engagement.value).toBeCloseTo(10.4, 1);
    expect(a.engagement.delta).toBeCloseTo(4.4, 1);
  });

  it("counts the window, picks recent posts, and formats lastSync", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    expect(a.totalPosts).toBe(3); // hour-age (null date) counts via scraped_at
    expect(a.lastSync).toBe("2026-07-16 06:00"); // max scraped_at (p4)

    // Recent = newest first by estimated_post_date (fallback scraped_at). p4 (5h) is newest.
    expect(a.recentPosts).toHaveLength(4);
    expect(a.recentPosts[0]!.id).toBe("p4");
    expect(a.recentPosts[0]!.date).toBe("5h"); // post_age used when date is null
    expect(a.recentPosts.find((p) => p.id === "p1")!.date).toBe("Jul 10");
    expect(a.recentPosts[0]).not.toHaveProperty("format");
  });

  it("buckets the current window into a series that totals the hero value", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    expect(a.impressionsSeries).toHaveLength(5); // 30d → 5 weekly buckets
    expect(a.impressionsSeries.reduce((s, p) => s + p.value, 0)).toBe(1700);
    expect(a.engagementSeries).toHaveLength(5);

    expect(buildDashboardAnalytics(ROWS, { range: "7d", now: NOW }).impressionsSeries).toHaveLength(
      7,
    );
    expect(
      buildDashboardAnalytics(ROWS, { range: "90d", now: NOW }).impressionsSeries,
    ).toHaveLength(3);
  });

  it("yields an empty dashboard when the current window has no posts", () => {
    // May post + a null-date post scraped back in May. Neither falls in the
    // current window, so the dashboard is genuinely empty. (p4 is deliberately
    // NOT used here any more — its recent scrape now puts it in the window.)
    const staleHourAge = biRow({
      linkedin_post_id: "p5",
      estimated_post_date: null,
      post_age: "3h",
      impressions: 900,
      scraped_at: "2026-05-20T10:00:00.000Z",
    });
    const priorOnly = [ROWS[2]!, staleHourAge];
    const a = buildDashboardAnalytics(priorOnly, { range: "30d", now: NOW });
    expect(a.totalPosts).toBe(0);
    expect(a.hero.value).toBe(0);
    expect(a.engagement.value).toBe(0);
    expect(a.recentPosts).toEqual([]);
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
    biRow({
      linkedin_post_id: "whale",
      impressions: 100_000,
      interactions: 1_000,
      scraped_at: "2026-07-15T00:00:00.000Z",
    }),
    biRow({
      linkedin_post_id: "minnow",
      impressions: 10,
      interactions: 5,
      scraped_at: "2026-07-15T00:00:00.000Z",
    }),
  ];

  it("reports the ratio of TOTALS, not the average of the two posts' rates", () => {
    const a = buildDashboardAnalytics(LOPSIDED, { range: "30d", now: NOW });

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
      biRow({
        linkedin_post_id: "minnow",
        impressions: 10,
        interactions: 0,
        scraped_at: "2026-07-15T00:00:00.000Z",
      }),
    ];

    const before = buildDashboardAnalytics(LOPSIDED, { range: "30d", now: NOW }).engagement.value;
    const after = buildDashboardAnalytics(quieterMinnow, { range: "30d", now: NOW }).engagement
      .value;

    expect(Math.abs(after - before)).toBeLessThan(0.5);
  });

  it("reports 0 — not NaN — when the period has impressions of zero", () => {
    const noReach = [
      biRow({
        linkedin_post_id: "a",
        impressions: 0,
        interactions: 0,
        scraped_at: "2026-07-15T00:00:00.000Z",
      }),
    ];

    const a = buildDashboardAnalytics(noReach, { range: "30d", now: NOW });

    expect(a.engagement.value).toBe(0);
    expect(Number.isNaN(a.engagement.value)).toBe(false);
  });
});

describe("getDashboardAnalytics (seam → bi.linkedin_post_latest)", () => {
  beforeEach(() => {
    biState.rows = [];
    biState.error = null;
    biState.eqCalls = [];
    biState.schemaCalls = [];
    biState.fromCalls = [];
    biState.orderCalls = [];
    biState.registry = [];
    biState.uploads = [];
  });

  it("reads the bi view and returns a well-formed analytics", async () => {
    biState.rows = ROWS;
    const a = await getDashboardAnalytics({ range: "30d" });

    expect(biState.schemaCalls).toContain("bi");
    expect(biState.fromCalls).toContain("linkedin_post_latest");
    expect(a.hero.label).toBe("Impressions");
    expect(a.kpis.map((k) => k.label)).toEqual(["Likes", "Comments", "Shares", "Saves"]);
    expect(Array.isArray(a.impressionsSeries)).toBe(true);
    expect(Array.isArray(a.recentPosts)).toBe(true);
  });

  it("filters by client_id when provided", async () => {
    biState.rows = ROWS;
    await getDashboardAnalytics({ range: "30d", clientId: "c1" });
    expect(biState.eqCalls).toContainEqual(["client_id", "c1"]);
  });

  it("returns the empty state for zero rows (available, just no data)", async () => {
    biState.rows = [];
    const a = await getDashboardAnalytics({ range: "7d" });
    expect(a.recentPosts).toEqual([]);
    expect(a.totalPosts).toBe(0);
    expect(a.unavailable).toBeFalsy(); // genuinely empty, not an outage
  });

  it("flags unavailable (does not throw) when the bi query errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    biState.error = { message: "permission denied for schema bi" };

    const a = await getDashboardAnalytics({ range: "30d" });

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
    biState.rows = [];
    biState.error = null;
    biState.eqCalls = [];
    biState.schemaCalls = [];
    biState.fromCalls = [];
    biState.orderCalls = [];
    biState.registry = [];
    biState.uploads = [];
  });

  it("counts EVERY post past the 1000-row response cap, not just the first page", async () => {
    biState.rows = Array.from({ length: PAGE_SIZE + 200 }, (_, i) =>
      biRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow, impressions: 10 }),
    );

    const a = await getDashboardAnalytics({ range: "30d" });

    expect(a.totalPosts).toBe(PAGE_SIZE + 200);
    // Nailed down explicitly: 1000 is precisely the number the defect produced.
    expect(a.totalPosts).not.toBe(PAGE_SIZE);
  });

  it("sums impressions across every page, so the hero KPI is not short either", async () => {
    biState.rows = Array.from({ length: PAGE_SIZE + 200 }, (_, i) =>
      biRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow, impressions: 10 }),
    );

    const a = await getDashboardAnalytics({ range: "30d" });

    expect(a.hero.value).toBe((PAGE_SIZE + 200) * 10);
  });

  // ⚠️ WITHOUT A STABLE ORDER THE ROW SET IS SILENTLY WRONG, NOT MERELY SHORT.
  // Pages 1..n are issued concurrently; with no total order the database may
  // return a row in two ranges or in neither.
  it("applies a stable order so concurrent page ranges cannot overlap or skip", async () => {
    biState.rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      biRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow }),
    );

    await getDashboardAnalytics({ range: "30d" });

    expect(biState.orderCalls).toContainEqual(["linkedin_post_id", { ascending: true }]);
  });

  // ⚠️ TWO DIFFERENT FACTS. "Meaningless" and "real but incomplete" must not
  // collapse into one flag — the screen says something different for each.
  it("flags TRUNCATED, not unavailable, when the read hits the page cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    biState.rows = Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, (_, i) =>
      biRow({ linkedin_post_id: `p${i}`, estimated_post_date: inWindow }),
    );

    const a = await getDashboardAnalytics({ range: "30d" });

    expect(a.truncated).toBe(true);
    // The rows are REAL — just incomplete. Not an outage.
    expect(a.unavailable).toBeFalsy();
    expect(a.totalPosts).toBe(MAX_PAGES * PAGE_SIZE);

    warn.mockRestore();
  });

  it("flags UNAVAILABLE, not truncated, when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    biState.error = { message: "permission denied for schema bi" };

    const a = await getDashboardAnalytics({ range: "30d" });

    expect(a.unavailable).toBe(true);
    expect(a.truncated).toBeFalsy();

    warn.mockRestore();
  });

  it("flags neither on a complete read", async () => {
    biState.rows = ROWS;

    const a = await getDashboardAnalytics({ range: "30d" });

    expect(a.unavailable).toBeFalsy();
    expect(a.truncated).toBeFalsy();
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

  const upload = (clientId: string, createdAt: string, followerCount: number | null) => ({
    id: `u-${clientId}-${createdAt}`,
    clientId,
    sourceType: "csv" as const,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount,
    createdAt,
  });

  beforeEach(() => {
    biState.rows = [];
    biState.error = null;
    biState.eqCalls = [];
    biState.schemaCalls = [];
    biState.fromCalls = [];
    biState.orderCalls = [];
    biState.registryCalls = 0;
    biState.uploadsCalls = 0;
    biState.registry = [
      { id: "c1", name: "Bryan Wish" },
      { id: "c2", name: "Ada Lovelace" },
    ];
    biState.uploads = [
      upload("c1", "2026-07-20T00:00:00.000Z", 10_000),
      upload("c2", "2026-07-20T00:00:00.000Z", 2_000),
    ];
  });

  // ⚠️ THE PARITY GATE. Every post in the window is either attributed to a
  // registry Client or counted as unattributed — never silently dropped. A
  // reader must be able to reconcile the table against the post count above it.
  it("accounts for EVERY post in the window: rows + unattributed === totalPosts", async () => {
    biState.rows = [
      biRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
      biRow({ linkedin_post_id: "b", client_id: "c1", estimated_post_date: inWindow }),
      biRow({ linkedin_post_id: "c", client_id: "c2", estimated_post_date: inWindow }),
      // ⚠️ A REAL UNATTRIBUTED POST. Attribution happens downstream (ADR 0009),
      // so a client_id matching nobody in the roster is expected, not a bug. A
      // parity test whose unattributed term is always 0 proves nothing.
      biRow({ linkedin_post_id: "d", client_id: "ghost", estimated_post_date: inWindow }),
    ];

    const a = await getDashboardAnalytics({ range: "30d" });
    const c = a.comparison!;

    expect(c.unattributedPosts).toBe(1);
    expect(c.rows.reduce((s, r) => s + r.posts, 0) + c.unattributedPosts).toBe(a.totalPosts);
    expect(a.totalPosts).toBe(4);
  });

  it("excludes posts outside the window from both the rows and the unattributed count", async () => {
    biState.rows = [
      biRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
      biRow({ linkedin_post_id: "old", client_id: "c1", estimated_post_date: outOfWindow }),
      biRow({ linkedin_post_id: "oldghost", client_id: "ghost", estimated_post_date: outOfWindow }),
    ];

    const a = await getDashboardAnalytics({ range: "30d" });
    const c = a.comparison!;

    expect(a.totalPosts).toBe(1);
    expect(c.rows.find((r) => r.clientId === "c1")!.posts).toBe(1);
    expect(c.unattributedPosts).toBe(0);
    expect(c.rows.reduce((s, r) => s + r.posts, 0) + c.unattributedPosts).toBe(a.totalPosts);
  });

  // ⚠️ A CLIENT WHO PUBLISHED NOTHING IS A FINDING. Dropping the row would make
  // the book look smaller and better than it is.
  it("keeps a Client with no posts in range, as a genuine 0 with nothing derived", async () => {
    biState.rows = [
      biRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
    ];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;
    const quiet = c.rows.find((r) => r.clientId === "c2")!;

    expect(quiet.posts).toBe(0);
    // ⚠️ NOT 0%. A Client who did not post has no engagement rate; a 0 would
    // claim a measured failure to engage.
    expect(quiet.engagementRate).toBeNull();
    expect(quiet.avgImpressions).toBeNull();
    expect(quiet.interactionsPer1K).toBeNull();
  });

  it("reports the engagement rate as null, never 0, when a Client had no impressions", async () => {
    biState.rows = [
      biRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 0,
        interactions: 0,
      }),
    ];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;
    const row = c.rows.find((r) => r.clientId === "c1")!;

    expect(row.posts).toBe(1); // it DID post — that part is measured
    expect(row.engagementRate).toBeNull();
    expect(row.avgImpressions).toBe(0); // a measured zero: it posted, got no reach
  });

  // ⚠️ ONE ENGAGEMENT-RATE DEFINITION. Impression-weighted, via `weightedRate`
  // — never the mean of the posts' individual rates.
  it("computes the engagement rate impression-weighted, not as a mean of per-post rates", async () => {
    biState.rows = [
      // 1 interaction / 10 impressions = 10%
      biRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 10,
        interactions: 1,
      }),
      // 10 interactions / 1000 impressions = 1%
      biRow({
        linkedin_post_id: "b",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 1000,
        interactions: 10,
      }),
    ];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    // Weighted: 11 / 1010 = 1.1%. A mean of rates would give 5.5%.
    expect(c.rows.find((r) => r.clientId === "c1")!.engagementRate).toBeCloseTo(1.1, 1);
  });

  it("averages impressions per post, and reports null rather than 0 when there are none", async () => {
    biState.rows = [
      biRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 300,
      }),
      biRow({
        linkedin_post_id: "b",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 100,
      }),
    ];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.rows.find((r) => r.clientId === "c1")!.avgImpressions).toBe(200);
    expect(c.rows.find((r) => r.clientId === "c2")!.avgImpressions).toBeNull();
  });
});

describe("the comparison's follower-normalised figure", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const upload = (clientId: string, createdAt: string, followerCount: number | null) => ({
    id: `u-${clientId}-${createdAt}`,
    clientId,
    sourceType: "csv" as const,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount,
    createdAt,
  });

  beforeEach(() => {
    biState.rows = [
      biRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        interactions: 500,
        impressions: 1000,
      }),
    ];
    biState.error = null;
    biState.orderCalls = [];
    biState.registryCalls = 0;
    biState.uploadsCalls = 0;
    biState.registry = [{ id: "c1", name: "Bryan Wish" }];
    biState.uploads = [];
  });

  it("takes the MOST RECENT recorded follower count, skipping uploads that recorded none", async () => {
    biState.uploads = [
      // Newest, but recorded nothing — skipped, never read as a drop to zero.
      upload("c1", "2026-07-22T00:00:00.000Z", null),
      upload("c1", "2026-07-20T00:00:00.000Z", 10_000),
      upload("c1", "2026-06-01T00:00:00.000Z", 4_000),
    ];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.rows[0]!.followers).toBe(10_000);
    // 500 interactions / 10,000 followers × 1000 = 50
    expect(c.rows[0]!.interactionsPer1K).toBeCloseTo(50, 5);
  });

  it("reports followers and the per-1,000 rate as null when nothing was ever recorded", async () => {
    biState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", null)];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.rows[0]!.followers).toBeNull();
    expect(c.rows[0]!.interactionsPer1K).toBeNull();
  });

  // ⚠️ A RATE PER NOTHING IS UNDEFINED — not Infinity, and not zero.
  it("reports the per-1,000 rate as null when the follower count is a recorded 0", async () => {
    biState.uploads = [upload("c1", "2026-07-20T00:00:00.000Z", 0)];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    // The 0 itself is a real measurement and is reported.
    expect(c.rows[0]!.followers).toBe(0);
    expect(c.rows[0]!.interactionsPer1K).toBeNull();
    expect(Number.isFinite(c.rows[0]!.interactionsPer1K as number)).toBe(false);
  });
});

describe("the comparison's medians carry their sample size", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  beforeEach(() => {
    biState.error = null;
    biState.orderCalls = [];
    biState.registryCalls = 0;
    biState.uploadsCalls = 0;
    biState.uploads = [];
    biState.registry = [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
      // Posted nothing: contributes no value to any median.
      { id: "c4", name: "D" },
    ];
    biState.rows = [
      biRow({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: inWindow,
        impressions: 100,
      }),
      biRow({
        linkedin_post_id: "b",
        client_id: "c2",
        estimated_post_date: inWindow,
        impressions: 200,
      }),
      biRow({
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
    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.medians.avgImpressions.value).toBe(200);
    // Three, NOT four — the silent Client has no average to contribute.
    expect(c.medians.avgImpressions.clients).toBe(3);
  });

  it("reports a null median with a zero count when no Client has the figure", async () => {
    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    // No uploads at all, so nobody has a follower count.
    expect(c.medians.followers.value).toBeNull();
    expect(c.medians.followers.clients).toBe(0);
  });
});

describe("the comparison is only built where it is meaningful", () => {
  const inWindow = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  beforeEach(() => {
    biState.rows = [
      biRow({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: inWindow }),
    ];
    biState.error = null;
    biState.orderCalls = [];
    biState.registryCalls = 0;
    biState.uploadsCalls = 0;
    biState.registry = [{ id: "c1", name: "Bryan Wish" }];
    biState.uploads = [];
  });

  // ⚠️ AND IT DOES NOT PAY FOR WHAT IT WILL NOT USE.
  it("is null for a single-client dashboard, and issues neither extra read", async () => {
    const a = await getDashboardAnalytics({ range: "30d", clientId: "c1" });

    expect(a.comparison).toBeNull();
    expect(biState.registryCalls).toBe(0);
    expect(biState.uploadsCalls).toBe(0);
  });

  it("is built, and reads both sources, in the all-clients state", async () => {
    const a = await getDashboardAnalytics({ range: "30d" });

    expect(a.comparison).not.toBeNull();
    expect(biState.registryCalls).toBe(1);
    expect(biState.uploadsCalls).toBe(1);
  });

  it("marks the comparison unavailable when the registry read failed — not empty", async () => {
    biState.registry = null;

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.unavailable).toBe(true);
    expect(c.rows).toEqual([]);
  });

  it("marks the comparison unavailable when the uploads read failed", async () => {
    biState.uploads = null;

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.unavailable).toBe(true);
  });

  it("is available and empty — not unavailable — when the registry is genuinely empty", async () => {
    biState.registry = [];

    const c = (await getDashboardAnalytics({ range: "30d" })).comparison!;

    expect(c.unavailable).toBe(false);
    expect(c.rows).toEqual([]);
  });
});
