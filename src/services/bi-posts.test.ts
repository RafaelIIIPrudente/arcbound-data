import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BiPostRow } from "./analytics";
import type { ReportPeriod } from "./types";

// ── Hermetic: mock Supabase + cookies so nothing ever touches the live DB. ────
// `public.linkedin_posts_staging` and the `bi` views are the analytics team's
// live production tables; no test in this repo may reach them.
const { state } = vi.hoisted(() => ({
  state: {
    /** [from, to] of each `.range()` call, in order. */
    ranges: [] as number[][],
    /** One entry per page, served BY PAGE INDEX (not by call order). */
    pages: [] as unknown[][],
    error: null as { message: string } | null,
    /** Fail exactly one page, to prove a LATE failure still fails the whole read. */
    errorOnPage: null as number | null,
    /** What `count: "exact"` reports. Defaults to the total rows in `pages`. */
    count: null as number | null,
    /** Set to make every request REJECT rather than resolve with an error. */
    rejectWith: null as string | null,
    /** The columns string each request selected. */
    selects: [] as string[],
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => {
        const q: Record<string, unknown> = {};
        // Captured per QUERY, not globally: concurrent pages are all built
        // before any resolves, so a shared cursor would serve them all the same
        // page and the merge would look correct while being wrong.
        let page = 0;
        let countOption: string | undefined;
        q.select = (columns: string, opts?: { count?: string }) => {
          state.selects.push(columns);
          countOption = opts?.count;
          return q;
        };
        q.eq = () => q;
        q.order = () => q;
        q.range = (from: number, to: number) => {
          state.ranges.push([from, to]);
          // Derived from the request itself so the mock never has to know
          // PAGE_SIZE and cannot drift from the module.
          page = from / (to - from + 1);
          return q;
        };
        q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          new Promise((r) => setTimeout(r, 0))
            .then(() => {
              // A genuine transport failure REJECTS; a query error RESOLVES with
              // `{ error }`. The seam has to survive both.
              if (state.rejectWith !== null) throw new Error(state.rejectWith);
              const error =
                state.error ??
                (state.errorOnPage === page ? { message: `page ${page} exploded` } : null);
              const total = state.pages.reduce((n, p) => n + p.length, 0);
              return {
                data: error ? null : (state.pages[page] ?? []),
                error,
                count: countOption === "exact" ? (state.count ?? total) : null,
              };
            })
            .then(resolve, reject);
        return q;
      },
    }),
  }),
}));

import {
  MAX_PAGES,
  PAGE_SIZE,
  periodRange,
  readClientPostRows,
  selectPeriodPlaceable,
  selectPeriodRows,
} from "./bi-posts";

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

const ids = (rows: BiPostRow[]) => rows.map((r) => r.linkedin_post_id);

const JULY: ReportPeriod = {
  kind: "month",
  key: "2026-07",
  label: "July 2026",
  year: 2026,
  month: 6,
};
const Q3: ReportPeriod = {
  kind: "quarter",
  key: "2026-Q3",
  label: "Q3 2026",
  year: 2026,
  quarter: 3,
};
const YEAR: ReportPeriod = { kind: "year", key: "2026", label: "2026", year: 2026 };
const ALL: ReportPeriod = { kind: "all", key: "all", label: "All time" };
/** A staff-chosen window: 12 Jun – 29 Jul 2026, both endpoints inclusive. */
const CUSTOM: ReportPeriod = {
  kind: "custom",
  key: "custom:2026-06-12..2026-07-29",
  label: "12 Jun – 29 Jul 2026",
  startDay: "2026-06-12",
  endDay: "2026-07-29",
};

beforeEach(() => {
  state.ranges = [];
  state.pages = [];
  state.error = null;
  state.errorOnPage = null;
  state.count = null;
  state.rejectWith = null;
  state.selects = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// UNDATABLE ROWS.
//
// A post scraped with an hour-granularity age ("23h") comes back with a NULL
// estimated_post_date, and `effectiveMs` falls back to `scraped_at`. A row with
// NEITHER cannot be placed on a time axis at all — but it is still one of the
// client's posts, and can still be counted and grouped by asset type.
//
// That is the whole divergence between the two selectors, and it is why the
// report reports TWO post counts rather than one.
// ─────────────────────────────────────────────────────────────────────────────
describe("selectPeriodRows — undatable rows", () => {
  const DATED = row({ linkedin_post_id: "dated", estimated_post_date: "2026-07-10" });
  const HOUR_AGE = row({
    // The realistic hour-age shape: no resolved date, but a scrape timestamp —
    // so it IS windowable, on `scraped_at`.
    linkedin_post_id: "hourAge",
    post_age: "23h",
    estimated_post_date: null,
    scraped_at: "2026-07-15T09:00:00.000Z",
  });
  const GHOST = row({
    // Neither a resolved date nor a scrape timestamp: genuinely unplaceable.
    linkedin_post_id: "ghost",
    post_age: "23h",
    estimated_post_date: null,
    scraped_at: null,
  });
  const ROWS = [DATED, HOUR_AGE, GHOST];

  it("returns EVERY row for all-time, including one that cannot be dated at all", () => {
    // All-time is not a wide window — it is every row. Running it through the
    // bounds would silently drop `ghost`, and the count above the drill-down
    // table would stop matching the rows in it.
    expect(ids(selectPeriodRows(ROWS, ALL))).toEqual(["dated", "hourAge", "ghost"]);
  });

  it("drops the undatable row for a BOUNDED period, because it cannot be placed", () => {
    // `hourAge` survives — it windows on `scraped_at` (15 July). `ghost` does
    // not, and asserting both in one test is what stops "excludes undatable"
    // from passing for the wrong reason.
    expect(ids(selectPeriodRows(ROWS, JULY))).toEqual(["dated", "hourAge"]);
  });

  it("excludes the undatable row from the PLACEABLE set even for all-time", () => {
    // The two selectors diverge ONLY here. If they ever agree on this fixture,
    // one of them has been rewritten in terms of the other incorrectly.
    expect(ids(selectPeriodPlaceable(ROWS, ALL).map((d) => d.row))).toEqual(["dated", "hourAge"]);
    expect(selectPeriodPlaceable(ROWS, ALL)).toHaveLength(2);
    expect(selectPeriodRows(ROWS, ALL)).toHaveLength(3);
  });

  it("windows the hour-age post on its SCRAPE time, not on a missing publish date", () => {
    const june: ReportPeriod = {
      kind: "month",
      key: "2026-06",
      label: "June 2026",
      year: 2026,
      month: 5,
    };
    // Scraped 15 July, so it belongs to July and NOT to June. Windowing on
    // `estimated_post_date` alone would drop it from every period at once.
    expect(ids(selectPeriodRows(ROWS, june))).toEqual([]);
    expect(
      selectPeriodPlaceable(ROWS, JULY).find((d) => d.row.linkedin_post_id === "hourAge")?.ms,
    ).toBe(Date.parse("2026-07-15T09:00:00.000Z"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HALF-OPEN [start, end).
//
// The boundary is the one place an off-by-one is invisible: a post at exactly
// midnight on the 1st belongs to the month that starts there, and a post at
// exactly the next month's midnight belongs to the NEXT one. Getting it wrong
// double-counts a post across two adjacent periods, or loses it from both.
// ─────────────────────────────────────────────────────────────────────────────
describe("period bounds are half-open — [start, end)", () => {
  const AT_START = row({ linkedin_post_id: "atStart", estimated_post_date: "2026-07-01" });
  const MID = row({ linkedin_post_id: "mid", estimated_post_date: "2026-07-15" });
  const AT_END = row({ linkedin_post_id: "atEnd", estimated_post_date: "2026-08-01" });
  const JUST_BEFORE = row({
    linkedin_post_id: "justBefore",
    estimated_post_date: "2026-06-30T23:59:59.999Z",
  });
  const ROWS = [JUST_BEFORE, AT_START, MID, AT_END];

  it("includes a post at exactly the month's first midnight, excludes the next month's", () => {
    expect(ids(selectPeriodRows(ROWS, JULY))).toEqual(["atStart", "mid"]);
  });

  it("hands the boundary post to the NEXT month, never to both", () => {
    const august: ReportPeriod = {
      kind: "month",
      key: "2026-08",
      label: "August 2026",
      year: 2026,
      month: 7,
    };
    // The complement of the assertion above: `atEnd` is in exactly one of the
    // two adjacent months. A closed upper bound would put it in both.
    expect(ids(selectPeriodRows(ROWS, august))).toEqual(["atEnd"]);
  });

  it("applies the same half-open rule to a QUARTER", () => {
    // Q3 2026 is 1 Jul → 1 Oct. Both July rows and the 1 August row fall in it;
    // 30 June does not.
    expect(ids(selectPeriodRows(ROWS, Q3))).toEqual(["atStart", "mid", "atEnd"]);
  });

  it("applies the same half-open rule to a YEAR", () => {
    const boundary = [
      row({ linkedin_post_id: "yearStart", estimated_post_date: "2026-01-01" }),
      row({ linkedin_post_id: "yearEnd", estimated_post_date: "2027-01-01" }),
    ];
    expect(ids(selectPeriodRows(boundary, YEAR))).toEqual(["yearStart"]);
  });

  it("returns nothing for a period the data does not reach, rather than everything", () => {
    const february: ReportPeriod = {
      kind: "month",
      key: "2026-02",
      label: "February 2026",
      year: 2026,
      month: 1,
    };
    expect(selectPeriodRows(ROWS, february)).toEqual([]);
    expect(selectPeriodPlaceable(ROWS, february)).toEqual([]);
  });

  it("preserves input order, so a caller can rely on the row sequence it was given", () => {
    // The paged read orders by linkedin_post_id and the report observes that
    // order downstream; a selector that sorted or reversed would break it.
    expect(ids(selectPeriodRows(ROWS, ALL))).toEqual(ids(ROWS));
  });
});

describe("readClientPostRows (paged bi read)", () => {
  it("selects post_url, so the drill-down can link out to each post", async () => {
    state.pages = [[row({ linkedin_post_id: "a" })]];

    await readClientPostRows("c1");

    expect(state.selects[0]).toContain("post_url");
  });

  it("selects BOTH engagement-rate columns, so the two can be reconciled", async () => {
    // ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, AND THE REVERSAL IS THE POINT.
    //
    // It previously pinned that NEITHER rate column was selected, because nobody
    // had declared which was authoritative and picking one would have silently
    // buried the discrepancy. That question is now settled: the view's
    // `calculated_engagement_rate` is the per-post figure ArcBase ships (ADR 0009
    // — the BI views own the analytics contract), and the scraper's
    // `provided_engagement_rate` is read ALONGSIDE it purely so the Data Quality
    // panel can report where the two disagree.
    //
    // Reading both is what makes a disagreement visible instead of a matter of
    // which column somebody happened to pick.
    state.pages = [[row({ linkedin_post_id: "a" })]];

    await readClientPostRows("c1");

    expect(state.selects[0]).toContain("calculated_engagement_rate");
    expect(state.selects[0]).toContain("provided_engagement_rate");
  });

  it("pages past the PostgREST 1000-row cap and merges every page in order", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => row({ linkedin_post_id: `p${i}` }));
    state.pages = [full, [row({ linkedin_post_id: "last" })]];

    const { rows, unavailable } = await readClientPostRows("c1");

    expect(unavailable).toBe(false);
    expect(rows).toHaveLength(PAGE_SIZE + 1);
    expect(rows[PAGE_SIZE]!.linkedin_post_id).toBe("last");
    expect(state.ranges).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
  });

  it("flags UNAVAILABLE — not an empty history — when page 0 fails", async () => {
    state.error = { message: "permission denied for schema bi" };

    const { rows, unavailable } = await readClientPostRows("c1");

    // The whole point of the flag: `rows: []` alone is indistinguishable from a
    // client who has never posted, and the two must never render the same.
    expect(unavailable).toBe(true);
    expect(rows).toEqual([]);
  });

  it("fails the WHOLE read when a LATER page errors, never a partial result", async () => {
    state.pages = [
      Array.from({ length: PAGE_SIZE }, (_, i) => row({ linkedin_post_id: `p${i}` })),
      Array.from({ length: PAGE_SIZE }, (_, i) => row({ linkedin_post_id: `q${i}` })),
      [row({ linkedin_post_id: "tail" })],
    ];
    state.errorOnPage = 2;

    const { rows, unavailable } = await readClientPostRows("c1");

    // Supabase RESOLVES with `{ error }` rather than rejecting, so a failed page
    // arrives looking like a normal result while its siblings hold real rows.
    // Handing back those 2000 would be a silent partial history.
    expect(unavailable).toBe(true);
    expect(rows).toEqual([]);
  });

  it("degrades rather than throwing when a request REJECTS outright", async () => {
    state.rejectWith = "socket hang up";

    // A transport failure is still "could not be read", not "no posts".
    // `total: null`, not 0 — a failed read learned nothing about how many posts
    // this client has, and 0 would assert an empty history.
    await expect(readClientPostRows("c1")).resolves.toEqual({
      rows: [],
      unavailable: true,
      truncated: false,
      total: null,
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it("caps the read at MAX_PAGES and says so out loud", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.pages = [Array.from({ length: PAGE_SIZE }, (_, i) => row({ linkedin_post_id: `p${i}` }))];
    state.count = 60_000; // > MAX_PAGES * PAGE_SIZE

    const { rows, unavailable } = await readClientPostRows("c1");

    expect(state.ranges).toHaveLength(MAX_PAGES);
    // Truncated, but still a successful read — the rows we got, not a failure.
    expect(unavailable).toBe(false);
    expect(rows).toHaveLength(PAGE_SIZE);
    // Observable truncation is the entire reason the count is asked for.
    const message = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(message).toContain("60000");
    expect(message).toContain(String(MAX_PAGES * PAGE_SIZE));
  });

  // ⚠️ THE FLAG USED TO STOP HERE. `readClientPostRows` discarded `truncated`
  // behind a comment saying its screens had no way to say "this is incomplete" —
  // so the Client report, the posts table and, worst of all, the PRINTED report
  // rendered a partial history as a complete one, with nothing on the page
  // saying so. A console warning is for operators; this is for the reader.
  it("SURFACES truncation to its callers, with the numbers behind it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.pages = [Array.from({ length: PAGE_SIZE }, (_, i) => row({ linkedin_post_id: `p${i}` }))];
    state.count = 60_000;

    const result = await readClientPostRows("c1");

    expect(result.truncated).toBe(true);
    // Real rows, not an outage — the two must never collapse.
    expect(result.unavailable).toBe(false);
    // The exact total, which is NOT what it managed to read.
    expect(result.total).toBe(60_000);
    expect(result.total).not.toBe(result.rows.length);
    warn.mockRestore();
  });

  it("reports truncated as false, with a real total, on a complete read", async () => {
    state.pages = [[row({ linkedin_post_id: "a" })]];

    const result = await readClientPostRows("c1");

    expect(result.truncated).toBe(false);
    expect(result.total).toBe(1);
  });

  it("issues exactly ONE request when the count fits in a single page", async () => {
    state.pages = [[row({ linkedin_post_id: "a" })]];

    await readClientPostRows("c1");

    expect(state.ranges).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A CUSTOM PERIOD'S BOUNDS — WHERE AN INCLUSIVE END MEETS A HALF-OPEN RANGE.
//
// ⚠️ THE OFF-BY-ONE THAT WOULD NOT ERROR. `resolveWindow` reports a window's end
// INCLUSIVELY (23:59:59.999Z on the end day), and every consumer here filters
// `ms < end`. Hand the inclusive instant straight through as `end` and the final
// day of every custom range silently vanishes: the posts are read, the count is
// short by a day's worth, and nothing throws. The conversion is `+ 1`.
// ─────────────────────────────────────────────────────────────────────────────
describe("a custom period converts its INCLUSIVE end into a half-open bound", () => {
  it("opens at the start day's first instant and closes at the day AFTER the end day", () => {
    expect(periodRange(CUSTOM)).toEqual({
      start: Date.parse("2026-06-12T00:00:00.000Z"),
      end: Date.parse("2026-07-30T00:00:00.000Z"),
    });
  });

  it("INCLUDES a post at 23:59:59.999Z on the end day", () => {
    // ⚠️ THE TEST THAT FAILS IF THE `+ 1` IS DROPPED. With the inclusive instant
    // used as an exclusive bound, `ms < end` is false at exactly this timestamp
    // and the post disappears from the last day of the range.
    const lastInstant = row({
      linkedin_post_id: "lastInstant",
      estimated_post_date: "2026-07-29T23:59:59.999Z",
    });

    expect(ids(selectPeriodRows([lastInstant], CUSTOM))).toEqual(["lastInstant"]);
  });

  it("EXCLUDES a post one millisecond later", () => {
    // The other side of the same boundary: one ms past the end day is the next
    // day, and must not be counted. Asserting only the inclusion above would
    // pass for an implementation that never closes the window at all.
    const justAfter = row({
      linkedin_post_id: "justAfter",
      estimated_post_date: "2026-07-30T00:00:00.000Z",
    });

    expect(selectPeriodRows([justAfter], CUSTOM)).toEqual([]);
  });

  it("INCLUDES a post at the start day's first instant, and excludes the one before", () => {
    const atStart = row({
      linkedin_post_id: "atStart",
      estimated_post_date: "2026-06-12T00:00:00.000Z",
    });
    const justBefore = row({
      linkedin_post_id: "justBefore",
      estimated_post_date: "2026-06-11T23:59:59.999Z",
    });

    expect(ids(selectPeriodRows([atStart, justBefore], CUSTOM))).toEqual(["atStart"]);
  });

  it("covers a SINGLE-DAY window as one whole day, not as an empty instant", () => {
    const oneDay: ReportPeriod = {
      kind: "custom",
      key: "custom:2026-07-29..2026-07-29",
      label: "29 Jul 2026",
      startDay: "2026-07-29",
      endDay: "2026-07-29",
    };
    const morning = row({
      linkedin_post_id: "morning",
      estimated_post_date: "2026-07-29T08:00:00.000Z",
    });

    expect(periodRange(oneDay).end - periodRange(oneDay).start).toBe(86_400_000);
    expect(ids(selectPeriodRows([morning], oneDay))).toEqual(["morning"]);
  });
});

describe("a custom period is a REAL WINDOW, not a second all-time", () => {
  const DATED = row({ linkedin_post_id: "dated", estimated_post_date: "2026-07-10" });
  const GHOST = row({
    // Neither a resolved date nor a scrape timestamp: genuinely unplaceable.
    linkedin_post_id: "ghost",
    post_age: "23h",
    estimated_post_date: null,
    scraped_at: null,
  });

  it("DROPS an undatable row, unlike all-time which keeps every row", () => {
    // ⚠️ All-time is every row, datable or not (bi-posts.ts:113). A custom period
    // must NOT inherit that short-circuit: it is a bounded window, and a row that
    // cannot be placed on a time axis cannot be shown to fall inside one.
    expect(ids(selectPeriodRows([DATED, GHOST], ALL))).toEqual(["dated", "ghost"]);
    expect(ids(selectPeriodRows([DATED, GHOST], CUSTOM))).toEqual(["dated"]);
  });

  it("windows an hour-age post on its SCRAPE time, as every bounded period does", () => {
    const hourAge = row({
      linkedin_post_id: "hourAge",
      post_age: "23h",
      estimated_post_date: null,
      scraped_at: "2026-07-15T09:00:00.000Z",
    });
    const outside = row({
      linkedin_post_id: "outside",
      post_age: "23h",
      estimated_post_date: null,
      scraped_at: "2026-09-01T09:00:00.000Z",
    });

    expect(ids(selectPeriodRows([hourAge, outside], CUSTOM))).toEqual(["hourAge"]);
  });

  it("agrees with itself: placeable and rows select the same set for a custom window", () => {
    // The two selectors diverge ONLY for all-time. If they ever disagree here,
    // one of them has grown a special case it should not have.
    const rows = [DATED, GHOST];
    expect(ids(selectPeriodRows(rows, CUSTOM))).toEqual(
      ids(selectPeriodPlaceable(rows, CUSTOM).map((d) => d.row)),
    );
  });
});
