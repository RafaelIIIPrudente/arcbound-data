import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BiPostRow } from "./analytics";

// ── Hermetic: mock Supabase + cookies so nothing ever touches the live DB. ────
// One mock serves all three reads the report seam makes: the paged `bi` view,
// `public.post_attributes` (via the post-attributes seam), and `public.uploads`.
const { state } = vi.hoisted(() => ({
  state: {
    /** [from, to] of each `.range()` call on the bi view, in order. */
    ranges: [] as number[][],
    /** One entry per bi page, served in order. */
    biPages: [] as unknown[][],
    biError: null as { message: string } | null,
    attributes: [] as unknown[],
    uploads: [] as unknown[],
    schemaCalls: [] as string[],
    fromCalls: [] as string[],
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    // bi.linkedin_post_latest — paged.
    schema: (s: string) => {
      state.schemaCalls.push(s);
      return {
        from: (t: string) => {
          state.fromCalls.push(t);
          const q: Record<string, unknown> = {};
          q.select = () => q;
          q.eq = () => q;
          q.or = () => q;
          q.order = () => q;
          q.range = (from: number, to: number) => {
            state.ranges.push([from, to]);
            return q;
          };
          q.then = (resolve: (v: unknown) => unknown) => {
            const index = state.ranges.length - 1;
            const data = state.biPages[index] ?? [];
            return Promise.resolve({ data, error: state.biError }).then(resolve);
          };
          return q;
        },
      };
    },
    // public.* — post_attributes and uploads.
    from: (t: string) => {
      state.fromCalls.push(t);
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

import {
  availablePeriods,
  buildClientReport,
  getClientReport,
  PAGE_SIZE,
  parseReportPeriod,
} from "./client-report";

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

const NOW = new Date("2026-07-16T12:00:00.000Z");

// Jan (1) · May (1) · Jun (2) · Jul (1). Feb–Apr are deliberately empty so the
// by-month chart has real gaps to render.
const HISTORY: BiPostRow[] = [
  row({
    linkedin_post_id: "jul1",
    estimated_post_date: "2026-07-10",
    impressions: 100,
    likes: 10,
    comments: 2,
    reposts: 1,
    interactions: 13,
  }),
  row({
    linkedin_post_id: "jun1",
    estimated_post_date: "2026-06-10",
    impressions: 200,
    likes: 20,
    comments: 4,
    reposts: 2,
    interactions: 26,
  }),
  row({
    linkedin_post_id: "jun2",
    estimated_post_date: "2026-06-20",
    impressions: 400,
    likes: 8,
    comments: 1,
    reposts: 1,
    interactions: 10,
  }),
  row({
    linkedin_post_id: "may1",
    estimated_post_date: "2026-05-05",
    impressions: 300,
    likes: 5,
    comments: 1,
    reposts: 0,
    interactions: 6,
  }),
  row({
    linkedin_post_id: "jan1",
    estimated_post_date: "2026-01-15",
    impressions: 900,
    likes: 100,
    comments: 20,
    reposts: 10,
    interactions: 130,
  }),
];

const JULY = { kind: "month", key: "2026-07", label: "July 2026", year: 2026, month: 6 } as const;

beforeEach(() => {
  state.ranges = [];
  state.biPages = [];
  state.biError = null;
  state.attributes = [];
  state.uploads = [];
  state.schemaCalls = [];
  state.fromCalls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("availablePeriods (pure)", () => {
  it("derives every month, quarter and year present, newest first, plus all-time", () => {
    const periods = availablePeriods(HISTORY);

    expect(periods[0]!.key).toBe("all");
    const months = periods.filter((p) => p.kind === "month").map((p) => p.key);
    expect(months).toEqual(["2026-07", "2026-06", "2026-05", "2026-01"]);
    const quarters = periods.filter((p) => p.kind === "quarter").map((p) => p.key);
    expect(quarters).toEqual(["2026-Q3", "2026-Q2", "2026-Q1"]);
    expect(periods.filter((p) => p.kind === "year").map((p) => p.key)).toEqual(["2026"]);
  });

  it("labels periods for humans, never as raw keys", () => {
    const periods = availablePeriods(HISTORY);
    expect(periods.find((p) => p.key === "2026-07")!.label).toBe("July 2026");
    expect(periods.find((p) => p.key === "2026-Q3")!.label).toBe("Q3 2026");
    expect(periods.find((p) => p.key === "all")!.label).toBe("All time");
  });

  it("returns only all-time when there are no posts", () => {
    expect(availablePeriods([]).map((p) => p.key)).toEqual(["all"]);
  });
});

describe("parseReportPeriod (pure)", () => {
  it("resolves a URL value that matches an available period", () => {
    const periods = availablePeriods(HISTORY);
    expect(parseReportPeriod("2026-06", periods).key).toBe("2026-06");
    expect(parseReportPeriod("all", periods).key).toBe("all");
  });

  it("falls back to the most recent MONTH that has data", () => {
    const periods = availablePeriods(HISTORY);
    // Undefined, unknown, and junk all land on the newest month — not all-time,
    // and not a year or quarter.
    expect(parseReportPeriod(undefined, periods).key).toBe("2026-07");
    expect(parseReportPeriod("2019-03", periods).key).toBe("2026-07");
    expect(parseReportPeriod("../etc/passwd", periods).key).toBe("2026-07");
  });

  it("falls back to all-time when no month has data", () => {
    expect(parseReportPeriod(undefined, availablePeriods([])).key).toBe("all");
  });
});

describe("buildClientReport (pure)", () => {
  it("collapses mixed-case format values into ONE asset bucket", () => {
    const rows = [
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", interactions: 10 }),
      row({ linkedin_post_id: "b", estimated_post_date: "2026-07-02", interactions: 20 }),
      row({ linkedin_post_id: "c", estimated_post_date: "2026-07-03", interactions: 30 }),
    ];
    // Raw storage (ADR 0009) legitimately holds all three casings.
    const formats = new Map([
      ["a", "DOCUMENT"],
      ["b", "document"],
      ["c", "  Document  "],
    ]);

    const report = buildClientReport(rows, formats, { period: JULY, now: NOW, followers: null });

    const docs = report.interactionsByAsset.filter((b) => b.format === "DOCUMENT");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.count).toBe(3);
    expect(docs[0]!.label).toBe("Document"); // human label, never the raw token
    expect(docs[0]!.value).toBe(20); // (10 + 20 + 30) / 3
  });

  it("counts a post with no attribute record as UNKNOWN, not as an error", () => {
    const rows = [
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", interactions: 10 }),
      row({ linkedin_post_id: "b", estimated_post_date: "2026-07-02", interactions: 30 }),
    ];
    const formats = new Map([["a", "VIDEO"]]); // "b" has no attribute row at all

    const report = buildClientReport(rows, formats, { period: JULY, now: NOW, followers: null });

    const unknown = report.postTypeDistribution.find((b) => b.format === "UNKNOWN")!;
    expect(unknown).toBeDefined();
    expect(unknown.count).toBe(1);
    expect(unknown.label).toBe("Unknown");
    expect(unknown.value).toBeCloseTo(50, 1); // percentage share of posts
  });

  it("also treats an unrecognised raw value as UNKNOWN", () => {
    const rows = [row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01" })];
    const formats = new Map([["a", "CAROUSEL_V2"]]);

    const report = buildClientReport(rows, formats, { period: JULY, now: NOW, followers: null });

    expect(report.postTypeDistribution.map((b) => b.format)).toEqual(["UNKNOWN"]);
  });

  it("computes prior-3-month and all-time figures from the FULL history", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });

    const by = (scope: string) => report.interactionsComparison.find((r) => r.scope === scope)!;
    expect(by("selected").likes).toBe(10); // July only
    expect(by("prior3").likes).toBe(33); // Apr–Jun: 20 + 8 + 5
    expect(by("allTime").likes).toBe(143); // every post, incl. January
    // The metric is `reposts` in the view but ALWAYS reads "Shares" to staff.
    expect(by("allTime").shares).toBe(14);
    expect(report.interactionsComparison.map((r) => r.label)).toEqual([
      "July 2026",
      "Prior 3 months",
      "All time",
    ]);
  });

  it("scopes row 1 to the period but rows 2 and 3 to all time", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });

    const selected = report.keyPerformance.selected;
    expect(selected.find((f) => f.label === "Total posts")!.value).toBe(1); // July only
    expect(report.totalPostsAllTime).toBe(5);

    // All-time max monthly posts is June's 2 — never the selected month's 1.
    const max = report.keyPerformance.allTimeMax;
    expect(max.find((f) => f.label === "Max monthly posts")!.value).toBe(2);
  });

  it("renders months with no posts as gaps, not as zero", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });

    // Jan → Jul inclusive = 7 points; Feb, Mar, Apr are empty.
    expect(report.impressionsByMonth).toHaveLength(7);
    const feb = report.impressionsByMonth[1]!;
    expect(feb.value).toBeNull(); // a gap — NOT 0, which would read as "no reach"
    expect(report.impressionsByMonth[0]!.value).toBe(900); // January
  });

  it("averages impressions by weekday across all seven days", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });

    expect(report.impressionsByWeekday.map((d) => d.label)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("reports the follower ratio as null (an em dash) when no upload carries a count", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });
    const ratio = report.keyPerformance.allTimeMax.find((f) => f.label.includes("1K followers"))!;
    expect(ratio.value).toBeNull();
    expect(ratio.approximate).toBe(true); // followers are per-Upload, not per-post
  });

  it("leads the scoped row with Total posts, Avg interactions, Total interactions", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });

    // Order matters: this row reproduces a page of the analytics engineer's
    // Power BI report, and a reader compares them side by side.
    expect(report.keyPerformance.selected.map((f) => f.label)).toEqual([
      "Total posts",
      "Avg interactions",
      "Total interactions",
    ]);
  });

  it("totals interactions from the `interactions` field, NOT from likes + comments + reposts", () => {
    // `interactions` is its own column in the externally-owned BI view and is
    // not guaranteed to equal the components — the view may count saves, or
    // clicks, or apply a definition of its own. These rows make the two
    // readings disagree on purpose: summing the field gives 150, deriving it
    // from likes + comments + reposts gives 20.
    const divergent: BiPostRow[] = [
      row({
        linkedin_post_id: "jul-a",
        estimated_post_date: "2026-07-04",
        likes: 10,
        comments: 5,
        reposts: 2,
        interactions: 100,
      }),
      row({
        linkedin_post_id: "jul-b",
        estimated_post_date: "2026-07-18",
        likes: 1,
        comments: 1,
        reposts: 1,
        interactions: 50,
      }),
    ];

    const report = buildClientReport(divergent, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
    });

    const total = report.keyPerformance.selected.find((f) => f.label === "Total interactions")!;
    expect(total.value).toBe(150);
  });

  it("reports 0 interactions, never NaN, for a period with no posts", () => {
    // February is empty in HISTORY, so the selected set is genuinely [].
    const february = {
      kind: "month",
      key: "2026-02",
      label: "February 2026",
      year: 2026,
      month: 1,
    } as const;

    const report = buildClientReport(HISTORY, new Map(), {
      period: february,
      now: NOW,
      followers: null,
    });

    const total = report.keyPerformance.selected.find((f) => f.label === "Total interactions")!;
    expect(total.value).toBe(0);
    expect(Number.isNaN(total.value)).toBe(false);
  });

  it("produces an empty report for a client with zero posts, without throwing", () => {
    const report = buildClientReport([], new Map(), {
      period: { kind: "all", key: "all", label: "All time" },
      now: NOW,
      followers: null,
    });

    expect(report.totalPostsAllTime).toBe(0);
    expect(report.impressionsByMonth).toEqual([]);
    expect(report.interactionsByAsset).toEqual([]);
    expect(report.postTypeDistribution).toEqual([]);
    expect(report.impressionsAverage).toBe(0);
    expect(report.interactionsComparison.every((r) => r.likes === 0)).toBe(true);
    // Weekday axis still renders all seven days at zero rather than vanishing.
    expect(report.impressionsByWeekday).toHaveLength(7);
  });
});

describe("getClientReport (seam → paged bi read)", () => {
  it("pages past the PostgREST 1000-row cap and merges every page", async () => {
    // A FULL first page must trigger a second request — a silent truncation here
    // would look like working software and report wrong all-time figures.
    const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
      row({ linkedin_post_id: `p${i}`, estimated_post_date: "2026-07-01", impressions: 1 }),
    );
    const tail = [row({ linkedin_post_id: "last", estimated_post_date: "2026-07-02" })];
    state.biPages = [full, tail];

    const report = await getClientReport({ clientId: "c1", period: "2026-07" });

    expect(state.ranges).toHaveLength(2);
    expect(state.ranges[0]).toEqual([0, PAGE_SIZE - 1]);
    expect(state.ranges[1]).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1]);
    expect(report.totalPostsAllTime).toBe(PAGE_SIZE + 1); // merged, not truncated
  });

  it("stops after a short page rather than requesting forever", async () => {
    state.biPages = [[row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01" })]];

    await getClientReport({ clientId: "c1", period: "all" });

    expect(state.ranges).toHaveLength(1);
  });

  it("reads the externally-owned bi view", async () => {
    state.biPages = [[row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01" })]];

    await getClientReport({ clientId: "c1", period: "all" });

    expect(state.schemaCalls).toContain("bi");
    expect(state.fromCalls).toContain("linkedin_post_latest");
  });

  it("joins the app-owned asset type onto the bi rows", async () => {
    state.biPages = [
      [row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", interactions: 5 })],
    ];
    state.attributes = [
      { linkedin_post_id: "a", post_format_type: "video", recorded_at: "2026-07-01" },
    ];

    const report = await getClientReport({ clientId: "c1", period: "all" });

    expect(report.postTypeDistribution.map((b) => b.format)).toEqual(["VIDEO"]);
  });

  it("flags unavailable (does not throw) when the bi read fails", async () => {
    state.biError = { message: "permission denied for schema bi" };

    const report = await getClientReport({ clientId: "c1", period: "all" });

    expect(report.unavailable).toBe(true);
    expect(report.totalPostsAllTime).toBe(0);
  });
});
