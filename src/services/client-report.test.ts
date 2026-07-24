import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BiPostRow } from "./analytics";
import type { ReportPeriod } from "./types";

// ── Hermetic: mock Supabase + cookies so nothing ever touches the live DB. ────
// One mock serves all three reads the report seam makes: the paged `bi` view,
// `public.post_attributes` (via the post-attributes seam), and `public.uploads`.
const { state } = vi.hoisted(() => ({
  state: {
    /** [from, to] of each `.range()` call on the bi view, in order. */
    ranges: [] as number[][],
    /** One entry per bi page, served BY PAGE INDEX (not by call order). */
    biPages: [] as unknown[][],
    biError: null as { message: string } | null,
    /** Fail exactly one page, to prove a LATE failure still fails the whole read. */
    biErrorOnPage: null as number | null,
    /** What `count: "exact"` reports. Defaults to the total rows in `biPages`. */
    biCount: null as number | null,
    /** The `count` option each bi request carried — `undefined` when it asked for none. */
    countOptions: [] as (string | undefined)[],
    /** Ids per `.in()` on post_attributes, in call order — observes merged ROW order. */
    attributeIdChunks: [] as string[][],
    attributes: [] as unknown[],
    uploads: [] as unknown[],
    schemaCalls: [] as string[],
    fromCalls: [] as string[],
    /** Concurrency probe: bi requests outstanding now, and the most at once. */
    inFlight: 0,
    peakInFlight: 0,
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
          // Captured per QUERY, not globally: concurrent pages are all built
          // before any resolves, so a shared cursor would serve them all the
          // same page and the merge would look correct while being wrong.
          let page = 0;
          let countOption: string | undefined;
          q.select = (_columns: string, opts?: { count?: string }) => {
            countOption = opts?.count;
            state.countOptions.push(opts?.count);
            return q;
          };
          q.eq = () => q;
          q.or = () => q;
          q.order = () => q;
          q.range = (from: number, to: number) => {
            state.ranges.push([from, to]);
            // Derived from the request itself (`from / pageLength`) so the mock
            // never has to know PAGE_SIZE and cannot drift from the module.
            page = from / (to - from + 1);
            return q;
          };
          q.then = (resolve: (v: unknown) => unknown) => {
            state.inFlight += 1;
            state.peakInFlight = Math.max(state.peakInFlight, state.inFlight);
            // Settled on a LATER macrotask so overlap is observable. Resolving
            // immediately would drain each page before the next was issued, and
            // peak in-flight would read 1 even for a fully concurrent caller.
            return new Promise((r) => setTimeout(r, 0))
              .then(() => {
                state.inFlight -= 1;
                const error =
                  state.biError ??
                  (state.biErrorOnPage === page ? { message: `page ${page} exploded` } : null);
                const total = state.biPages.reduce((n, p) => n + p.length, 0);
                return {
                  data: error ? null : (state.biPages[page] ?? []),
                  error,
                  count: countOption === "exact" ? (state.biCount ?? total) : null,
                };
              })
              .then(resolve);
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
      q.in = (_column: string, ids: string[]) => {
        state.attributeIdChunks.push(ids);
        return q;
      };
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

// PAGE_SIZE / MAX_PAGES now live in the shared `bi-posts` seam — the paging they
// govern is read by the report AND the per-post drill-down. Import paths only:
// every assertion below is unchanged, which is what makes this file the guard
// proving that extraction was behaviour-preserving.
import { MAX_PAGES, PAGE_SIZE } from "./bi-posts";
import {
  availablePeriods,
  buildClientReport,
  getClientReport,
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

/**
 * Pages of the given sizes. Ids encode `page-offset`, so the merged order is
 * observable rather than inferred from a row count that any ordering satisfies.
 */
function pagesOf(sizes: number[]): BiPostRow[][] {
  return sizes.map((size, page) =>
    Array.from({ length: size }, (_, i) =>
      row({
        linkedin_post_id: `p${page}-${i}`,
        estimated_post_date: "2026-07-01",
        impressions: 1,
      }),
    ),
  );
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
const ALL_TIME = { kind: "all", key: "all", label: "All time" } as const;
const Q3 = { kind: "quarter", key: "2026-Q3", label: "Q3 2026", year: 2026, quarter: 3 } as const;
const YEAR_2026 = { kind: "year", key: "2026", label: "2026", year: 2026 } as const;

beforeEach(() => {
  state.ranges = [];
  state.biPages = [];
  state.biError = null;
  state.biErrorOnPage = null;
  state.biCount = null;
  state.countOptions = [];
  state.attributeIdChunks = [];
  state.attributes = [];
  state.uploads = [];
  state.schemaCalls = [];
  state.fromCalls = [];
  state.inFlight = 0;
  state.peakInFlight = 0;
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

describe("period scoping — what the picker moves, and what it deliberately does not", () => {
  // ⚠️ THIS DOCUMENTS A DELIBERATE DESIGN, NOT A BUG.
  //
  // Key Performance renders a period-scoped HERO row above an ALL-TIME matrix
  // (see the doc comment in key-performance.tsx). Only the hero answers to the
  // period picker: the "Monthly avg"/"Monthly max" matrix and the per-1K line
  // are all-time by construction and MUST NOT move when the period changes.
  //
  // Consequence, and the reason this block exists: on a client whose posts all
  // sit in the newest month, selecting "All time" selects the SAME ROWS, so the
  // hero is identical too and literally nothing changes but the caption. That
  // reads as a broken picker and is correct behaviour. Anyone re-investigating
  // "All time does nothing" should start here.
  const build = (rows: BiPostRow[], key: string | undefined) => {
    const periods = availablePeriods(rows);
    return buildClientReport(rows, new Map(), {
      period: parseReportPeriod(key, periods),
      now: NOW,
      followers: 1000,
      availablePeriods: periods,
    });
  };
  const figures = (r: ReturnType<typeof build>) =>
    r.keyPerformance.selected.map((f) => [f.label, f.value]);

  // Jul ×2, Jun ×1, May ×1 — a period change genuinely changes the row set.
  const SPREAD = [
    row({ linkedin_post_id: "jul1", estimated_post_date: "2026-07-10", interactions: 10 }),
    row({ linkedin_post_id: "jul2", estimated_post_date: "2026-07-11", interactions: 20 }),
    row({ linkedin_post_id: "jun1", estimated_post_date: "2026-06-10", interactions: 100 }),
    row({ linkedin_post_id: "may1", estimated_post_date: "2026-05-10", interactions: 500 }),
  ];

  it("widens the HERO figures when the period widens to all-time", () => {
    expect(figures(build(SPREAD, undefined))).toEqual([
      ["Total posts", 2],
      ["Avg interactions", 15],
      ["Total interactions", 30],
    ]);
    expect(figures(build(SPREAD, "all"))).toEqual([
      ["Total posts", 4],
      ["Avg interactions", 157.5],
      ["Total interactions", 630],
    ]);
  });

  it("leaves the all-time matrix and per-1K line UNCHANGED by the period", () => {
    const month = build(SPREAD, undefined);
    const all = build(SPREAD, "all");

    // Identical on purpose. If a future change makes these track the period,
    // that is a product decision, not a bug fix — and this test should be the
    // thing that forces the conversation.
    expect(all.keyPerformance.matrix).toEqual(month.keyPerformance.matrix);
    expect(all.keyPerformance.perThousandFollowers).toEqual(
      month.keyPerformance.perThousandFollowers,
    );
  });

  it("produces IDENTICAL figures for all-time and newest-month when every post sits in one month", () => {
    // The live shape at ~50 posts, and the whole explanation for "All time does
    // nothing": same rows in, same numbers out.
    const oneMonth = [
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-10", interactions: 10 }),
      row({ linkedin_post_id: "b", estimated_post_date: "2026-07-11", interactions: 20 }),
      row({ linkedin_post_id: "c", estimated_post_date: "2026-07-12", interactions: 30 }),
    ];

    expect(figures(build(oneMonth, "all"))).toEqual(figures(build(oneMonth, undefined)));
    // ...and the period really did resolve differently, so this is not vacuous.
    expect(build(oneMonth, "all").period.key).toBe("all");
    expect(build(oneMonth, undefined).period.key).toBe("2026-07");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PINNING GATE.
//
// Scoping the four charts to the selected period changes the data source of a
// loop that ALSO computes `monthSpan`, `maxMonthlyPosts` and
// `maxMonthlyInteractions` — three figures that are all-time BY DESIGN and feed
// the Key Performance matrix. A one-character slip there rewrites the matrix
// with numbers that still look entirely plausible, which is the worst failure
// this codebase can produce: wrong analytics that read as right.
//
// So the whole of Key Performance and Interactions Comparison is pinned here,
// deep-equal, under EVERY period kind — because the change affects each kind's
// code path differently, and pinning one would prove nothing about the others.
// If any number below moves, the change was not scoped correctly.
// ─────────────────────────────────────────────────────────────────────────────
describe("all-time figures are INVARIANT to the selected period", () => {
  const build = (period: ReportPeriod) =>
    buildClientReport(HISTORY, new Map(), {
      period,
      now: NOW,
      followers: 5000,
      availablePeriods: availablePeriods(HISTORY),
    });

  // 5 posts over a Jan→Jul span (7 months); 185 interactions all-time.
  const MATRIX = [
    {
      label: "Monthly avg",
      posts: { label: "Avg monthly posts", value: 0.7 }, // 5 / 7
      perPost: { label: "Avg interactions per post", value: 37 }, // 185 / 5
      interactions: { label: "Avg monthly interactions", value: 26.4 }, // 185 / 7
    },
    {
      label: "Monthly max",
      posts: { label: "Max monthly posts", value: 2 }, // June
      perPost: null,
      interactions: { label: "Max monthly interactions", value: 130 }, // January
    },
  ];
  const PER_1K = {
    label: "Avg interactions per 1K followers",
    value: 7.4, // (185 / 5) / 5000 * 1000
    approximate: true,
  };

  it.each([
    ["month", JULY],
    ["quarter", Q3],
    ["year", YEAR_2026],
    ["all", ALL_TIME],
  ] as const)("keeps the all-time matrix identical for a %s period", (_kind, period) => {
    const { keyPerformance } = build(period);

    expect(keyPerformance.matrix).toEqual(MATRIX);
    expect(keyPerformance.perThousandFollowers).toEqual(PER_1K);
  });

  it("keeps the all-time row of Interactions Comparison identical for every period", () => {
    for (const period of [JULY, Q3, YEAR_2026, ALL_TIME]) {
      const allTime = build(period).interactionsComparison.find((r) => r.scope === "allTime")!;

      expect(allTime).toEqual({
        scope: "allTime",
        label: "All time",
        likes: 143,
        comments: 28,
        shares: 14,
        // Extended, not weakened: every HISTORY post carries a real `saves: 0`,
        // so the scope is fully reported and the sum is a genuine zero.
        saves: 0,
        savesPartial: false,
      });
    }
  });

  it("keeps totalPostsAllTime at the full history for every period", () => {
    for (const period of [JULY, Q3, YEAR_2026, ALL_TIME]) {
      expect(build(period).totalPostsAllTime).toBe(5);
    }
  });

  it("keeps the period-scoped figures scoped — the pin must not freeze everything", () => {
    // Guard the guard. If the assertions above passed because the whole report
    // had become period-invariant, this would fail: `selected` and the
    // `selected`/`prior3` comparison rows MUST still move with the period.
    const july = build(JULY);
    const all = build(ALL_TIME);

    expect(july.keyPerformance.selected.find((f) => f.label === "Total posts")!.value).toBe(1);
    expect(all.keyPerformance.selected.find((f) => f.label === "Total posts")!.value).toBe(5);

    const selectedRow = (r: ReturnType<typeof build>) =>
      r.interactionsComparison.find((x) => x.scope === "selected")!;
    expect(selectedRow(july).likes).toBe(10);
    expect(selectedRow(all).likes).toBe(143);
  });
});

describe("the four charts follow the selected period", () => {
  const build = (period: ReportPeriod, rows = HISTORY, formats = new Map<string, string>()) =>
    buildClientReport(rows, formats, {
      period,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });

  it("scopes the impressions series to a quarter", () => {
    // Q3 2026 is Jul–Sep; only jul1 falls in it, so the series is July alone —
    // not the Jan→Jul span the all-time chart draws.
    const report = build(Q3);

    expect(report.impressionsBucket).toBe("month");
    expect(report.impressionsSeries).toEqual([{ label: "Jul 26", value: 100 }]);
  });

  it("buckets a MONTH period by week, not by month", () => {
    // Bucketed by month this would be a single bar, which is not a chart.
    // July 2026 has 31 days → 5 blocks; jul1 is the 10th, so block 2 (8–14).
    const report = build(JULY);

    expect(report.impressionsBucket).toBe("week");
    expect(report.impressionsSeries).toEqual([
      { label: "1–7", value: null },
      { label: "8–14", value: 100 },
      { label: "15–21", value: null },
      { label: "22–28", value: null },
      { label: "29–31", value: null },
    ]);
  });

  it("tiles a SHORT month exactly, with no orphaned trailing block", () => {
    // February 2026 has 28 days → exactly 4 blocks, and the last one ends on
    // the 28th rather than claiming days the month does not have.
    const feb = {
      kind: "month",
      key: "2026-02",
      label: "February 2026",
      year: 2026,
      month: 1,
    } as const;
    const rows = [
      row({ linkedin_post_id: "f1", estimated_post_date: "2026-02-27", impressions: 50 }),
    ];

    const report = build(feb, rows);

    expect(report.impressionsSeries.map((p) => p.label)).toEqual(["1–7", "8–14", "15–21", "22–28"]);
    expect(report.impressionsSeries[3]!.value).toBe(50);
  });

  it("averages the reference line over the SAME rows the chart draws", () => {
    // All-time mean impressions is (100+200+400+300+900)/5 = 380. Scoped to
    // June it must be (200+400)/2 = 300 — a line through the all-time mean
    // would sit above every bar it is drawn against.
    const june = {
      kind: "month",
      key: "2026-06",
      label: "June 2026",
      year: 2026,
      month: 5,
    } as const;

    expect(build(ALL_TIME).impressionsAverage).toBe(380);
    expect(build(june).impressionsAverage).toBe(300);
  });

  it("scopes the weekday averages to the period", () => {
    // June holds jun1 (Wed 10th, 200) and jun2 (Sat 20th, 400). Every other
    // weekday is 0 for that month, though all-time they are not.
    const june = {
      kind: "month",
      key: "2026-06",
      label: "June 2026",
      year: 2026,
      month: 5,
    } as const;
    const byDay = Object.fromEntries(
      build(june).impressionsByWeekday.map((d) => [d.label, d.value]),
    );

    expect(byDay["Wed"]).toBe(200);
    expect(byDay["Sat"]).toBe(400);
    expect(byDay["Fri"]).toBe(0); // jan1 was a Thursday all-time; not in June
  });

  it("scopes BOTH asset charts — one grouping feeds them both", () => {
    const formats = new Map([
      ["jul1", "IMAGE"],
      ["jun1", "VIDEO"],
      ["jun2", "VIDEO"],
      ["may1", "IMAGE"],
      ["jan1", "POLL"],
    ]);
    const june = {
      kind: "month",
      key: "2026-06",
      label: "June 2026",
      year: 2026,
      month: 5,
    } as const;

    const report = build(june, HISTORY, formats);

    // June is two VIDEO posts and nothing else — so 100%, not the 40% that the
    // same two posts represent across the full history.
    expect(report.interactionsByAsset).toEqual([
      { format: "VIDEO", label: "Video", value: 18, count: 2 }, // (26 + 10) / 2
    ]);
    expect(report.postTypeDistribution).toEqual([
      { format: "VIDEO", label: "Video", value: 100, count: 2 },
    ]);
  });

  it("reproduces the previous all-time output when the period IS all-time", () => {
    const formats = new Map([
      ["jul1", "IMAGE"],
      ["jun1", "VIDEO"],
      ["jun2", "VIDEO"],
      ["may1", "IMAGE"],
      ["jan1", "POLL"],
    ]);
    const report = build(ALL_TIME, HISTORY, formats);

    // 5 posts: 2 IMAGE, 2 VIDEO, 1 POLL — the distribution the charts drew
    // before they were scoped at all.
    expect(report.postTypeDistribution.map((b) => [b.format, b.value])).toEqual([
      ["IMAGE", 40],
      ["VIDEO", 40],
      ["POLL", 20],
    ]);
    expect(report.impressionsSeries).toHaveLength(7); // Jan → Jul
    expect(report.impressionsAverage).toBe(380);
  });

  it("reports the post count behind each chart, and they differ honestly", () => {
    // An UNDATABLE row can be grouped by asset but cannot be placed on a time
    // axis, so the two counts are genuinely different and must not be conflated.
    const undatable = row({ linkedin_post_id: "ghost", interactions: 5 });
    const report = build(ALL_TIME, [...HISTORY, undatable]);

    expect(report.assetPostCount).toBe(6); // every row in the period
    expect(report.impressionsPostCount).toBe(5); // only the datable ones
  });

  it("renders an EMPTY period as empty states, never zeros or NaN", () => {
    // February holds no posts at all.
    const feb = {
      kind: "month",
      key: "2026-02",
      label: "February 2026",
      year: 2026,
      month: 1,
    } as const;
    const report = build(feb);

    expect(report.impressionsSeries).toEqual([]); // not five null weeks
    expect(report.interactionsByAsset).toEqual([]);
    expect(report.postTypeDistribution).toEqual([]);
    expect(report.impressionsAverage).toBe(0);
    expect(report.impressionsPostCount).toBe(0);
    expect(report.assetPostCount).toBe(0);
    // The weekday axis keeps all seven days at zero rather than vanishing.
    expect(report.impressionsByWeekday).toHaveLength(7);
    expect(report.impressionsByWeekday.every((d) => d.value === 0)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('null,"value":NaN');
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

    const report = buildClientReport(rows, formats, {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });

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

    const report = buildClientReport(rows, formats, {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });

    const unknown = report.postTypeDistribution.find((b) => b.format === "UNKNOWN")!;
    expect(unknown).toBeDefined();
    expect(unknown.count).toBe(1);
    expect(unknown.label).toBe("Unknown");
    expect(unknown.value).toBeCloseTo(50, 1); // percentage share of posts
  });

  it("also treats an unrecognised raw value as UNKNOWN", () => {
    const rows = [row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01" })];
    const formats = new Map([["a", "CAROUSEL_V2"]]);

    const report = buildClientReport(rows, formats, {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });

    expect(report.postTypeDistribution.map((b) => b.format)).toEqual(["UNKNOWN"]);
  });

  it("computes prior-3-month and all-time figures from the FULL history", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(HISTORY),
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
      availablePeriods: availablePeriods(HISTORY),
    });

    const selected = report.keyPerformance.selected;
    expect(selected.find((f) => f.label === "Total posts")!.value).toBe(1); // July only
    expect(report.totalPostsAllTime).toBe(5);

    // All-time max monthly posts is June's 2 — never the selected month's 1.
    const max = report.keyPerformance.matrix.find((r) => r.label === "Monthly max")!;
    expect(max.posts.value).toBe(2);
  });

  it("keeps every key-performance figure at the value the old 3x3 grid showed", () => {
    // THE RESHAPE GUARD. Moving nine figures from three flat arrays into a hero
    // plus a matrix is presentation only — this pins all nine so a value that
    // shifted during the move cannot pass as a layout change.
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(HISTORY),
    });
    const { selected, matrix, perThousandFollowers } = report.keyPerformance;
    const value = (label: string) => selected.find((f) => f.label === label)!.value;

    // Hero — the selected period (July holds one post, interactions 13).
    expect(value("Total posts")).toBe(1);
    expect(value("Avg interactions")).toBe(13);
    expect(value("Total interactions")).toBe(13);

    // Matrix row 1 — all-time averages over a 7-month span (Jan → Jul).
    const avg = matrix.find((r) => r.label === "Monthly avg")!;
    expect(avg.posts.value).toBe(0.7); // 5 posts / 7 months
    expect(avg.perPost!.value).toBe(37); // 185 interactions / 5 posts
    expect(avg.interactions.value).toBe(26.4); // 185 / 7 months

    // Matrix row 2 — all-time maxima. The per-post cell is genuinely ABSENT:
    // a maximum has no per-post rate, and it must never render as 0.
    const max = matrix.find((r) => r.label === "Monthly max")!;
    expect(max.posts.value).toBe(2); // June
    expect(max.perPost).toBeNull();
    expect(max.interactions.value).toBe(130); // January

    // The follower ratio is an AVERAGE, so it no longer sits among the maxima.
    expect(perThousandFollowers.value).toBeNull(); // no upload carries a count
    expect(perThousandFollowers.approximate).toBe(true);
  });

  it("renders months with no posts as gaps, not as zero", () => {
    // ALL_TIME, not JULY: a month period now buckets by WEEK, so months with
    // gaps in them only exist for the wider periods. The rule under test — an
    // empty bucket is null, never 0 — is unchanged.
    const report = buildClientReport(HISTORY, new Map(), {
      period: ALL_TIME,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(HISTORY),
    });

    // Jan → Jul inclusive = 7 points; Feb, Mar, Apr are empty.
    expect(report.impressionsBucket).toBe("month");
    expect(report.impressionsSeries).toHaveLength(7);
    const feb = report.impressionsSeries[1]!;
    expect(feb.value).toBeNull(); // a gap — NOT 0, which would read as "no reach"
    expect(report.impressionsSeries[0]!.value).toBe(900); // January
  });

  it("averages impressions by weekday across all seven days", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(HISTORY),
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
      availablePeriods: availablePeriods(HISTORY),
    });
    const ratio = report.keyPerformance.perThousandFollowers;
    expect(ratio.label).toContain("1K followers");
    expect(ratio.value).toBeNull();
    expect(ratio.approximate).toBe(true); // followers are per-Upload, not per-post
  });

  it("leads the scoped row with Total posts, Avg interactions, Total interactions", () => {
    const report = buildClientReport(HISTORY, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(HISTORY),
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
      availablePeriods: availablePeriods(divergent),
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
      availablePeriods: availablePeriods(HISTORY),
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
      availablePeriods: availablePeriods([]),
    });

    expect(report.totalPostsAllTime).toBe(0);
    expect(report.impressionsSeries).toEqual([]);
    expect(report.interactionsByAsset).toEqual([]);
    expect(report.postTypeDistribution).toEqual([]);
    expect(report.impressionsAverage).toBe(0);
    expect(report.interactionsComparison.every((r) => r.likes === 0)).toBe(true);
    // Weekday axis still renders all seven days at zero rather than vanishing.
    expect(report.impressionsByWeekday).toHaveLength(7);
  });

  it("aggregates a row set past the engine's spread-argument limit without throwing", () => {
    // ⚠️ THE SIZE IS THE TEST. `Math.min(...times)` spread every timestamp into
    // ONE call; past the argument limit V8 throws RangeError — a hard crash on
    // a large client, not a slowdown. Measured on this Node (v25): 100k spreads
    // fine, 125k throws. 130k clears the threshold with margin, and a 200-row
    // fixture would pass against the BROKEN implementation and prove nothing.
    const many = Array.from({ length: 130_000 }, (_, i) =>
      row({
        linkedin_post_id: `p${i}`,
        // Spread across two months so the month walk does real work too.
        estimated_post_date: i % 2 === 0 ? "2026-06-10" : "2026-07-10",
        impressions: 1,
        interactions: 1,
      }),
    );

    const report = buildClientReport(many, new Map(), {
      period: { kind: "all", key: "all", label: "All time" },
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods([]),
    });

    expect(report.totalPostsAllTime).toBe(130_000);
    // The min/max still bound the real window: June and July, nothing else.
    expect(report.impressionsSeries.map((p) => p.label)).toEqual(["Jun 26", "Jul 26"]);
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

  it("issues exactly ONE request when the count fits in a single page", async () => {
    state.biPages = pagesOf([1]);

    await getClientReport({ clientId: "c1", period: "all" });

    expect(state.ranges).toHaveLength(1);
  });

  it("asks for an EXACT count, on the first page only", async () => {
    state.biPages = pagesOf([PAGE_SIZE, 500]);

    await getClientReport({ clientId: "c1", period: "all" });

    // "planned"/"estimated" are PostgREST's cheap approximations. An
    // under-estimate would compute too few pages and silently drop rows —
    // exactly the silent-wrong-numbers failure the paging exists to prevent.
    expect(state.countOptions).toEqual(["exact", undefined]);
  });

  it("issues exactly one request per page and merges them in PAGE ORDER", async () => {
    const pages = pagesOf([PAGE_SIZE, PAGE_SIZE, 500]); // count defaults to 2500

    state.biPages = pages;
    const report = await getClientReport({ clientId: "c1", period: "all" });

    expect(state.ranges).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
    expect(report.totalPostsAllTime).toBe(2500);

    // Row ORDER, observed downstream rather than asserted on a shuffled count:
    // the seam hands `listPostAttributes` the merged ids, and its chunk queries
    // are built in that order. Concurrency that resolved out of order would
    // scramble this while leaving the row COUNT correct.
    expect(state.attributeIdChunks.flat()).toEqual(pages.flat().map((r) => r.linkedin_post_id));
  });

  it("issues pages 1..n CONCURRENTLY, not one after another", async () => {
    state.biPages = pagesOf([PAGE_SIZE, PAGE_SIZE, 500]);

    await getClientReport({ clientId: "c1", period: "all" });

    // ⚠️ THE DISCRIMINATING ASSERTION FOR THE WHOLE SLICE.
    //
    // A serial walk peaks at 1 in-flight BY CONSTRUCTION, so this fails against
    // it — which is the only reason to trust it. Asserting the request COUNT
    // would pass under serial and parallel alike and prove nothing.
    //
    // Page 0 goes alone (it carries the count that sizes the rest), then pages
    // 1 and 2 go out together: peak 2.
    expect(state.peakInFlight).toBeGreaterThan(1);
    expect(state.peakInFlight).toBe(2);
  });

  it("fails the WHOLE read when a LATER page errors, never a partial result", async () => {
    state.biPages = pagesOf([PAGE_SIZE, PAGE_SIZE, 500]);
    state.biErrorOnPage = 2;

    const report = await getClientReport({ clientId: "c1", period: "all" });

    // Supabase RESOLVES with `{ error }` rather than rejecting, so a failed page
    // arrives looking like a normal result while its siblings hold real rows.
    // Reporting those 2000 rows as the client's history would be a silent wrong
    // number — worse than the unavailable banner, because it looks like data.
    expect(report.unavailable).toBe(true);
    expect(report.totalPostsAllTime).toBe(0);
  });

  it("warns and caps the read when the count exceeds the page cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.biPages = pagesOf([PAGE_SIZE]); // pages 1..49 serve []
    state.biCount = 60_000; // > MAX_PAGES * PAGE_SIZE

    const report = await getClientReport({ clientId: "c1", period: "all" });

    expect(state.ranges).toHaveLength(MAX_PAGES);
    // Truncated, but still a REPORT — the rows we got, not an error page.
    expect(report.unavailable).toBeUndefined();
    expect(report.totalPostsAllTime).toBe(PAGE_SIZE);
    // The count made this observable; the old loop truncated silently.
    const message = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(message).toContain("60000");
    expect(message).toContain(String(MAX_PAGES * PAGE_SIZE));
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

// ─────────────────────────────────────────────────────────────────────────────
// SAVES IN THE INTERACTIONS COMPARISON — THREE STATES.
//
// ⚠️ `saves` is genuinely nullable: the scrape may omit it. The other three
// metrics coerce an absent value to 0 safely; saves cannot, because a 0 would
// report an absent measurement as a measured one. And a PARTIAL sum printed as
// a total is the same lie in a subtler form.
// ─────────────────────────────────────────────────────────────────────────────
describe("comparisonRow — saves keeps its three states apart", () => {
  const build = (rows: BiPostRow[]) =>
    buildClientReport(rows, new Map(), {
      period: ALL_TIME,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });
  const allTimeRow = (rows: BiPostRow[]) =>
    build(rows).interactionsComparison.find((r) => r.scope === "allTime")!;

  it("sums saves and marks the scope complete when EVERY post reported them", () => {
    const result = allTimeRow([
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", saves: 3 }),
      row({ linkedin_post_id: "b", estimated_post_date: "2026-07-02", saves: 4 }),
    ]);

    expect(result.saves).toBe(7);
    expect(result.savesPartial).toBe(false);
  });

  it("reports NULL — never 0 — when no post in the scope reported saves", () => {
    const result = allTimeRow([
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", saves: null }),
      row({ linkedin_post_id: "b", estimated_post_date: "2026-07-02", saves: null }),
    ]);

    // A 0 here would claim these posts were saved zero times. We do not know.
    expect(result.saves).toBeNull();
    expect(result.saves).not.toBe(0);
    expect(result.savesPartial).toBe(false);
  });

  it("marks a MIXED scope partial, summing only the posts that reported", () => {
    const result = allTimeRow([
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", saves: 3 }),
      row({ linkedin_post_id: "b", estimated_post_date: "2026-07-02", saves: null }),
      row({ linkedin_post_id: "c", estimated_post_date: "2026-07-03", saves: 4 }),
    ]);

    // The sum is real but INCOMPLETE — a lower bound, and flagged as one.
    expect(result.saves).toBe(7);
    expect(result.savesPartial).toBe(true);
  });

  it("distinguishes a measured ZERO from an absent measurement", () => {
    // ⚠️ THE DISCRIMINATING PAIR. Both scopes "have no saves"; only one of them
    // is a fact. Collapsing them is the defect this repo has fixed three times.
    const measured = allTimeRow([
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", saves: 0 }),
    ]);
    const absent = allTimeRow([
      row({ linkedin_post_id: "a", estimated_post_date: "2026-07-01", saves: null }),
    ]);

    expect(measured.saves).toBe(0);
    expect(measured.savesPartial).toBe(false);
    expect(absent.saves).toBeNull();
  });

  it("scopes saves to the period, like every other metric in the table", () => {
    const rows = [
      row({ linkedin_post_id: "jul", estimated_post_date: "2026-07-10", saves: 5 }),
      row({ linkedin_post_id: "jan", estimated_post_date: "2026-01-10", saves: 100 }),
    ];
    const report = buildClientReport(rows, new Map(), {
      period: JULY,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });

    const selected = report.interactionsComparison.find((r) => r.scope === "selected")!;
    expect(selected.saves).toBe(5);
    expect(report.interactionsComparison.find((r) => r.scope === "allTime")!.saves).toBe(105);
  });
});
