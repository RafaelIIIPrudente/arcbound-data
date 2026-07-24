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
    await expect(readClientPostRows("c1")).resolves.toEqual({ rows: [], unavailable: true });
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

  it("issues exactly ONE request when the count fits in a single page", async () => {
    state.pages = [[row({ linkedin_post_id: "a" })]];

    await readClientPostRows("c1");

    expect(state.ranges).toHaveLength(1);
  });
});
