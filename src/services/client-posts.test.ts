import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BiPostRow } from "./analytics";

// ── Hermetic: mock Supabase + cookies so nothing ever touches the live DB. ────
// One mock serves all three reads: the paged `bi` view, `public.post_attributes`
// and `public.uploads` (the report seam reads the last one; this one does not).
const { state } = vi.hoisted(() => ({
  state: {
    /** One entry per bi page, served BY PAGE INDEX (not by call order). */
    biPages: [] as unknown[][],
    biError: null as { message: string } | null,
    attributes: [] as unknown[],
    uploads: [] as unknown[],
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => {
        const q: Record<string, unknown> = {};
        // Captured per QUERY: concurrent pages are all built before any
        // resolves, so a shared cursor would serve them all the same page.
        let page = 0;
        let countOption: string | undefined;
        q.select = (_columns: string, opts?: { count?: string }) => {
          countOption = opts?.count;
          return q;
        };
        q.eq = () => q;
        q.order = () => q;
        q.range = (from: number, to: number) => {
          page = from / (to - from + 1);
          return q;
        };
        q.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: state.biError ? null : (state.biPages[page] ?? []),
            error: state.biError,
            count: countOption === "exact" ? state.biPages.reduce((n, p) => n + p.length, 0) : null,
          }).then(resolve);
        return q;
      },
    }),
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.in = () => q;
      q.order = () => q;
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: t === "uploads" ? state.uploads : state.attributes,
          error: null,
        }).then(resolve);
      return q;
    },
  }),
}));

import { getClientPosts, MAX_TABLE_ROWS } from "./client-posts";
import { getClientReport } from "./client-report";

function row(over: Partial<BiPostRow>): BiPostRow {
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

/**
 * ONE fixture, fed to BOTH seams. Spread across four months of 2026 so a year,
 * a quarter and a month each select a genuinely different subset — and carrying
 * an hour-age post with NO scrape timestamp, so the all-time case exercises the
 * divergence between datable and undatable rows rather than passing by luck.
 */
const FIXTURE: BiPostRow[] = [
  row({
    linkedin_post_id: "jul1",
    post_url: "https://www.linkedin.com/feed/update/jul1",
    post_content: "  July   post   one  ",
    estimated_post_date: "2026-07-10",
    impressions: 100,
    likes: 10,
    comments: 2,
    reposts: 1,
    saves: 3,
    interactions: 16,
  }),
  row({
    linkedin_post_id: "jul2",
    estimated_post_date: "2026-07-20",
    impressions: 900,
    likes: 20,
    comments: 4,
    reposts: 2,
    saves: null, // the scrape omitted it — NOT a measured zero
    interactions: 26,
  }),
  row({
    linkedin_post_id: "jun1",
    estimated_post_date: "2026-06-15",
    impressions: 400,
    likes: 8,
    comments: 1,
    reposts: 1,
    saves: 0, // a measured zero — must never render like `jul2`
    interactions: 10,
  }),
  row({
    linkedin_post_id: "mar1",
    estimated_post_date: "2026-03-05",
    impressions: 300,
    likes: 5,
    comments: 1,
    reposts: 0,
    saves: 1,
    interactions: 7,
  }),
  row({
    // Hour-age with no scrape timestamp: counted and groupable, but genuinely
    // unplaceable on a time axis. This is the row that makes all-time diverge.
    linkedin_post_id: "ghost",
    post_age: "23h",
    estimated_post_date: null,
    scraped_at: null,
    impressions: 50,
    likes: 1,
    comments: 0,
    reposts: 0,
    saves: null,
    interactions: 1,
  }),
];

beforeEach(() => {
  state.biPages = [FIXTURE];
  state.biError = null;
  state.attributes = [];
  state.uploads = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ACCEPTANCE CRITERION.
//
// The report prints "N posts"; this screen lists the posts behind that N. If the
// two can ever disagree, the feature is wrong however good it looks — a table
// that contradicts the figure above it discredits both screens at once.
//
// They agree BY CONSTRUCTION: both call `selectPeriodRows` from
// `@/services/bi-posts`. This test is what stops someone reintroducing a second
// copy of the predicate, so it runs over every period KIND, because each takes a
// different branch (all-time short-circuits; the other three go through the
// half-open bounds).
// ─────────────────────────────────────────────────────────────────────────────
describe("PARITY — the post count matches the report, for every period kind", () => {
  it.each([
    ["all-time", "all"],
    ["a year", "2026"],
    ["a quarter", "2026-Q3"],
    ["a month", "2026-07"],
  ])("agrees with the report's assetPostCount for %s", async (_kind, period) => {
    const [posts, report] = await Promise.all([
      getClientPosts({ clientId: "c1", period }),
      getClientReport({ clientId: "c1", period }),
    ]);

    expect(posts.period.key).toBe(period);
    expect(report.period.key).toBe(period);
    expect(posts.totalInPeriod).toBe(report.assetPostCount);
  });

  it("selects genuinely different subsets per period, so the parity is not vacuous", async () => {
    // Guard the guard. Four equal counts would satisfy the parity assertions
    // above while proving nothing; these are the numbers those assertions ride
    // on, pinned so a collapse to one value fails loudly.
    const counts = await Promise.all(
      ["all", "2026", "2026-Q3", "2026-07", "2026-06"].map(
        async (period) => (await getClientPosts({ clientId: "c1", period })).totalInPeriod,
      ),
    );

    // all-time is 5 (INCLUDING `ghost`); 2026 is 4 (the four datable rows);
    // Q3 is 2 (July); July is 2; June is 1.
    expect(counts).toEqual([5, 4, 2, 2, 1]);
  });

  it("counts the UNDATABLE post in all-time — the divergence the fixture exists for", async () => {
    const all = await getClientPosts({ clientId: "c1", period: "all" });
    const year = await getClientPosts({ clientId: "c1", period: "2026" });

    // `ghost` is one of this client's posts and is listed at all-time, but it
    // cannot be placed in any bounded window. If the two counts ever match,
    // the fixture stopped exercising the case this parity rule is about.
    expect(all.rows.map((r) => r.id)).toContain("ghost");
    expect(year.rows.map((r) => r.id)).not.toContain("ghost");
    expect(all.totalInPeriod).toBe(year.totalInPeriod + 1);
  });

  it("offers the SAME period options as the report for the same client", async () => {
    const [posts, report] = await Promise.all([
      getClientPosts({ clientId: "c1" }),
      getClientReport({ clientId: "c1" }),
    ]);

    expect(posts.availablePeriods).toEqual(report.availablePeriods);
    // ...and resolves an absent `?period=` to the same default, so landing on
    // either screen without a param shows the same window.
    expect(posts.period).toEqual(report.period);
  });
});

describe("getClientPosts — row mapping", () => {
  it("orders by impressions, descending", async () => {
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });

    expect(rows.map((r) => r.impressions)).toEqual([900, 400, 300, 100, 50]);
  });

  it("collapses whitespace and keeps the post url for the outbound link", async () => {
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });
    const jul1 = rows.find((r) => r.id === "jul1")!;

    expect(jul1.snippet).toBe("July post one");
    expect(jul1.url).toBe("https://www.linkedin.com/feed/update/jul1");
  });

  it("reports a MISSING url as null, so the cell can render text instead of a dead link", async () => {
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });

    expect(rows.find((r) => r.id === "jul2")!.url).toBeNull();
  });

  it("keeps an omitted `saves` as NULL and a measured zero as 0", async () => {
    // ⚠️ The distinction this repo has fixed twice. `null` is "the scrape did
    // not report it"; `0` is "it was reported, and it was none". Collapsing them
    // invents a measurement.
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });

    expect(rows.find((r) => r.id === "jul2")!.saves).toBeNull();
    expect(rows.find((r) => r.id === "jun1")!.saves).toBe(0);
    expect(rows.find((r) => r.id === "jul1")!.saves).toBe(3);
  });

  it("labels `reposts` as shares, carrying the view's column into the UI's word", async () => {
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });

    expect(rows.find((r) => r.id === "jul1")!.shares).toBe(1);
  });

  it("shows the resolved date for a datable post and the RAW AGE for an hour-age one", async () => {
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });
    const jul1 = rows.find((r) => r.id === "jul1")!;
    const ghost = rows.find((r) => r.id === "ghost")!;

    expect(jul1.date).toBe("2026-07-10");
    expect(ghost.date).toBeNull();
    expect(ghost.age).toBe("23h");
  });

  it("NEVER surfaces scraped_at as a publish date", async () => {
    // `effectiveMs` falls back to `scraped_at` for WINDOWING, and that fallback
    // must not leak into the displayed date — the scrape date is not the date
    // the post was published on.
    state.biPages = [
      [
        row({
          linkedin_post_id: "hourAge",
          post_age: "23h",
          estimated_post_date: null,
          scraped_at: "2026-07-15T09:00:00.000Z",
        }),
      ],
    ];

    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });

    expect(rows[0]!.date).toBeNull();
    expect(rows[0]!.age).toBe("23h");
    // It IS windowable, though — the sort key still places it.
    expect(rows[0]!.sortMs).toBe(Date.parse("2026-07-15T09:00:00.000Z"));
  });

  it("carries the report's windowing key as the date sort key", async () => {
    const { rows } = await getClientPosts({ clientId: "c1", period: "all" });

    expect(rows.find((r) => r.id === "jul1")!.sortMs).toBe(Date.parse("2026-07-10"));
    // Unplaceable → null, so the column can park it last rather than at epoch 0.
    expect(rows.find((r) => r.id === "ghost")!.sortMs).toBeNull();
  });

  it("resolves the asset type to a HUMAN label, collapsing raw casing", async () => {
    // Raw storage (ADR 0009) legitimately holds mixed-case variants of one
    // format; grouping on the raw string would split it across buckets.
    state.attributes = [
      { linkedin_post_id: "jul1", post_format_type: "document", recorded_at: "2026-07-10" },
      { linkedin_post_id: "jul2", post_format_type: "  VIDEO  ", recorded_at: "2026-07-20" },
    ];

    const { rows } = await getClientPosts({ clientId: "c1", period: "2026-07" });

    expect(rows.find((r) => r.id === "jul1")!.format).toBe("DOCUMENT");
    expect(rows.find((r) => r.id === "jul1")!.formatLabel).toBe("Document");
    expect(rows.find((r) => r.id === "jul2")!.formatLabel).toBe("Video");
  });

  it("shows a post with no attribute record as UNKNOWN — a real format, not an error", async () => {
    state.attributes = [
      { linkedin_post_id: "jul1", post_format_type: "VIDEO", recorded_at: "2026-07-10" },
    ];

    const { rows } = await getClientPosts({ clientId: "c1", period: "2026-07" });

    const jul2 = rows.find((r) => r.id === "jul2")!;
    expect(jul2.format).toBe("UNKNOWN");
    expect(jul2.formatLabel).toBe("Unknown");
  });

  it("treats an unrecognised raw value as UNKNOWN rather than showing the token", async () => {
    state.attributes = [
      { linkedin_post_id: "jul1", post_format_type: "CAROUSEL_V2", recorded_at: "2026-07-10" },
    ];

    const { rows } = await getClientPosts({ clientId: "c1", period: "2026-07" });

    // No raw scraper token ever reaches a user-facing string.
    expect(rows.find((r) => r.id === "jul1")!.formatLabel).toBe("Unknown");
  });
});

describe("getClientPosts — the display cap", () => {
  it("reports no cap when every row fits", async () => {
    const { rows, totalInPeriod, cappedTo } = await getClientPosts({
      clientId: "c1",
      period: "all",
    });

    expect(cappedTo).toBeNull();
    expect(totalInPeriod).toBe(rows.length);
  });

  it("keeps the TOP rows by impressions and says how many it dropped", async () => {
    // Impressions ascend with the index, so the top `MAX_TABLE_ROWS` are the
    // LAST ones — a cap applied before the sort would keep the wrong end.
    const many = Array.from({ length: MAX_TABLE_ROWS + 12 }, (_, i) =>
      row({
        linkedin_post_id: `p${i}`,
        estimated_post_date: "2026-07-01",
        impressions: i,
      }),
    );
    state.biPages = [many];

    const { rows, totalInPeriod, cappedTo } = await getClientPosts({
      clientId: "c1",
      period: "2026-07",
    });

    expect(totalInPeriod).toBe(MAX_TABLE_ROWS + 12); // the TRUE total, uncapped
    expect(rows).toHaveLength(MAX_TABLE_ROWS);
    expect(cappedTo).toBe(MAX_TABLE_ROWS);
    // Highest impressions first, and the lowest 12 are the ones dropped.
    expect(rows[0]!.impressions).toBe(MAX_TABLE_ROWS + 11);
    expect(rows.at(-1)!.impressions).toBe(12);
  });

  it("does not cap at exactly the limit — the notice must mean something", async () => {
    state.biPages = [
      Array.from({ length: MAX_TABLE_ROWS }, (_, i) =>
        row({ linkedin_post_id: `p${i}`, estimated_post_date: "2026-07-01", impressions: i }),
      ),
    ];

    const { rows, cappedTo } = await getClientPosts({ clientId: "c1", period: "2026-07" });

    expect(rows).toHaveLength(MAX_TABLE_ROWS);
    expect(cappedTo).toBeNull();
  });
});

describe("getClientPosts — degradation", () => {
  it("flags UNAVAILABLE when the bi read fails, never an empty table", async () => {
    state.biError = { message: "permission denied for schema bi" };

    const result = await getClientPosts({ clientId: "c1", period: "all" });

    // "Could not be read" and "this period has no posts" are different facts and
    // render differently. A failed read must never masquerade as an empty state.
    expect(result.unavailable).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.totalInPeriod).toBe(0);
  });

  it("returns an EMPTY result — with no unavailable flag — for a client with no posts", async () => {
    // The read SUCCEEDED and found nothing. That is an empty state, and it must
    // not borrow the unavailable banner.
    state.biPages = [[]];

    const result = await getClientPosts({ clientId: "c1", period: "all" });

    expect(result.unavailable).toBeUndefined();
    expect(result.rows).toEqual([]);
    expect(result.totalInPeriod).toBe(0);
  });

  it("falls back to a period that HAS data rather than rendering an empty one", async () => {
    // ⚠️ A SELECTABLE PERIOD ALWAYS HOLDS POSTS. `availablePeriods` is derived
    // from the months the data actually covers, and `parseReportPeriod` rejects
    // anything outside it — so February, which holds nothing, is not offered and
    // a hand-typed `?period=2026-02` resolves to the newest month instead.
    //
    // Consequence, and the reason this is pinned: for a client WITH posts, the
    // per-period empty state is unreachable. It exists for the zero-post client
    // above. Anyone investigating "the empty state never shows" starts here.
    const february = await getClientPosts({ clientId: "c1", period: "2026-02" });

    expect(february.period.key).toBe("2026-07");
    expect(february.rows).toHaveLength(2);
    expect(february.availablePeriods.map((p) => p.key)).not.toContain("2026-02");
  });

  it("still resolves a period when the read failed, so the picker keeps working", async () => {
    state.biError = { message: "permission denied for schema bi" };

    const result = await getClientPosts({ clientId: "c1", period: "all" });

    expect(result.period.key).toBe("all");
    expect(result.availablePeriods.map((p) => p.key)).toEqual(["all"]);
  });

  it("shows posts as Unknown rather than erroring when the attributes read fails", async () => {
    state.attributes = [];

    const { rows } = await getClientPosts({ clientId: "c1", period: "2026-07" });

    expect(rows.every((r) => r.formatLabel === "Unknown")).toBe(true);
  });
});
