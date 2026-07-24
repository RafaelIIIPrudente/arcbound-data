import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BiPostRow } from "./analytics";

// ── Hermetic: mock Supabase + cookies so nothing ever touches the live DB. ────
// One mock serves all four reads: `public.clients`, the paged `bi` view,
// `public.uploads`, and `public.post_attributes`.
const { state } = vi.hoisted(() => ({
  state: {
    clients: [] as unknown[],
    clientsError: null as { message: string } | null,
    biRows: [] as unknown[],
    biError: null as { message: string } | null,
    /** Overrides the count page 0 reports, to fake a table past the page cap. */
    biCountOverride: null as number | null,
    uploads: [] as unknown[],
    uploadsError: null as { message: string } | null,
    attributes: [] as unknown[],
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    /** A range-aware chainable modelling PostgREST's paged response. */
    const paged = (
      rows: unknown[],
      error: { message: string } | null,
      countOverride: number | null = null,
    ) => {
      const q: Record<string, unknown> = {};
      let from = 0;
      let to = PAGE_SIZE - 1;
      let wantsCount = false;
      q.select = (_c?: unknown, opts?: { count?: string }) => {
        if (opts?.count === "exact") wantsCount = true;
        return q;
      };
      q.range = (f: number, t: number) => {
        from = f;
        to = t;
        return q;
      };
      for (const m of ["eq", "in", "order", "or"]) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: error ? null : rows.slice(from, to + 1),
          error,
          count: wantsCount ? (countOverride ?? rows.length) : null,
        }).then(resolve);
      return q;
    };

    return {
      schema: () => ({ from: () => paged(state.biRows, state.biError, state.biCountOverride) }),
      from: (table: string) => {
        if (table === "uploads") return paged(state.uploads, state.uploadsError);
        if (table === "post_attributes") return paged(state.attributes, null);
        return paged(state.clients, state.clientsError);
      },
    };
  },
}));

import { PAGE_SIZE, MAX_PAGES } from "@/lib/supabase/paged";

import {
  getDataQuality,
  RATE_TOLERANCE_PCT,
  reconcileRates,
  severityRank,
  STALE_AFTER_DAYS,
} from "./data-quality";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function post(over: Partial<BiPostRow>): BiPostRow {
  return {
    client_id: "c1",
    client_name: "Bryan Wish",
    linkedin_post_id: "p",
    post_url: null,
    post_content: "content",
    post_age: null,
    estimated_post_date: "2026-07-10",
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

const upload = (
  clientId: string,
  createdAt: string,
  rowsInserted: number,
  over: Record<string, unknown> = {},
) => ({
  id: `u-${clientId}-${createdAt}`,
  client_id: clientId,
  source_type: "csv",
  rows_inserted: rowsInserted,
  rows_updated: 0,
  rows_unchanged: 0,
  follower_count: null,
  created_at: createdAt,
  ...over,
});

beforeEach(() => {
  state.clients = [
    { id: "c1", name: "Bryan Wish" },
    { id: "c2", name: "Priya Nadella" },
  ];
  state.clientsError = null;
  state.biRows = [];
  state.biError = null;
  state.biCountOverride = null;
  state.uploads = [];
  state.uploadsError = null;
  state.attributes = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getDataQuality — submitted vs attributed", () => {
  it("counts DISTINCT posts submitted from rowsInserted, never the re-ingests", async () => {
    // ⚠️ Weekly uploads re-send the same posts. `rows_updated` and
    // `rows_unchanged` are re-ingests of posts an earlier upload already
    // counted; adding them would inflate "submitted" every single week and make
    // the comparison against "attributed" meaningless.
    state.uploads = [
      upload("c1", "2026-07-20T09:00:00.000Z", 3, { rows_updated: 40, rows_unchanged: 100 }),
      upload("c1", "2026-07-13T09:00:00.000Z", 5, { rows_updated: 20, rows_unchanged: 50 }),
    ];

    const { rows } = await getDataQuality({ now: NOW });

    expect(rows.find((r) => r.clientId === "c1")!.submitted).toBe(8);
    expect(rows.find((r) => r.clientId === "c1")!.uploadCount).toBe(2);
  });

  it("counts what actually came back attributed, per client", async () => {
    state.biRows = [
      post({ linkedin_post_id: "a", client_id: "c1" }),
      post({ linkedin_post_id: "b", client_id: "c1" }),
      post({ linkedin_post_id: "c", client_id: "c2" }),
    ];

    const { rows } = await getDataQuality({ now: NOW });

    expect(rows.find((r) => r.clientId === "c1")!.attributed).toBe(2);
    expect(rows.find((r) => r.clientId === "c2")!.attributed).toBe(1);
  });

  it("shows the headline case: posts submitted, none attributed back", async () => {
    // THE REASON THIS SCREEN EXISTS. Attribution is a downstream name match, so
    // a client whose ArcBase name does not match the scrape submits posts that
    // never return — and nothing else in the product says so.
    state.uploads = [upload("c2", "2026-07-20T09:00:00.000Z", 40)];
    state.biRows = [post({ linkedin_post_id: "a", client_id: "c1" })];

    const { rows } = await getDataQuality({ now: NOW });
    const priya = rows.find((r) => r.clientId === "c2")!;

    expect(priya.submitted).toBe(40);
    expect(priya.attributed).toBe(0);
    // ...and it sorts to the very top, ahead of every lesser concern.
    expect(rows[0]!.clientId).toBe("c2");
  });

  it("reports a client with no uploads as a real 0, not as unknown", async () => {
    const { rows } = await getDataQuality({ now: NOW });

    // The read SUCCEEDED and found nothing — a fact, not missing data.
    expect(rows.find((r) => r.clientId === "c1")!.submitted).toBe(0);
    expect(rows.find((r) => r.clientId === "c1")!.uploadCount).toBe(0);
    expect(rows.find((r) => r.clientId === "c1")!.lastIngest).toBeNull();
  });
});

describe("getDataQuality — undated and unknown-type posts", () => {
  it("counts posts with no resolved publish date", async () => {
    state.biRows = [
      post({ linkedin_post_id: "a", client_id: "c1", estimated_post_date: "2026-07-10" }),
      // Hour-age: invisible to every BOUNDED reporting period, which is exactly
      // why it is worth surfacing here.
      post({
        linkedin_post_id: "b",
        client_id: "c1",
        estimated_post_date: null,
        post_age: "23h",
        scraped_at: "2026-07-23T09:00:00.000Z",
      }),
    ];

    const { rows } = await getDataQuality({ now: NOW });

    expect(rows.find((r) => r.clientId === "c1")!.undated).toBe(1);
    expect(rows.find((r) => r.clientId === "c1")!.attributed).toBe(2);
  });

  it("does NOT let the scraped_at windowing fallback mask an undated post", async () => {
    // `effectiveMs` falls back to `scraped_at` so a post can still be windowed.
    // That fallback must not make this figure read zero — the publish date is
    // genuinely absent, whatever the windowing does about it.
    state.biRows = [
      post({
        linkedin_post_id: "a",
        client_id: "c1",
        estimated_post_date: null,
        scraped_at: "2026-07-23T09:00:00.000Z",
      }),
    ];

    expect(
      (await getDataQuality({ now: NOW })).rows.find((r) => r.clientId === "c1")!.undated,
    ).toBe(1);
  });

  it("counts posts whose asset type resolves to UNKNOWN, collapsing raw casing", async () => {
    state.biRows = [
      post({ linkedin_post_id: "a", client_id: "c1" }),
      post({ linkedin_post_id: "b", client_id: "c1" }),
      post({ linkedin_post_id: "c", client_id: "c1" }),
    ];
    state.attributes = [
      // ADR 0009: storage is raw, so mixed casing is legitimate and must still
      // resolve to a known format.
      { linkedin_post_id: "a", post_format_type: "  document ", recorded_at: "2026-07-10" },
      // Unrecognised → UNKNOWN, same as having no record at all ("c").
      { linkedin_post_id: "b", post_format_type: "CAROUSEL_V2", recorded_at: "2026-07-10" },
    ];

    const { rows } = await getDataQuality({ now: NOW });

    expect(rows.find((r) => r.clientId === "c1")!.unknownFormat).toBe(2);
  });
});

describe("getDataQuality — unattributed posts", () => {
  it("counts posts whose client_id matches no registered client", async () => {
    state.biRows = [
      post({ linkedin_post_id: "a", client_id: "c1" }),
      post({ linkedin_post_id: "b", client_id: "ghost-client" }),
      post({ linkedin_post_id: "c", client_id: "ghost-client" }),
    ];

    const { unattributedPosts } = await getDataQuality({ now: NOW });

    expect(unattributedPosts).toBe(2);
  });

  it("also counts posts carrying a NULL client_id", async () => {
    // ⚠️ `BiPostRow` types `client_id` as non-nullable, but `fetchPostCounts` has
    // always guarded for null — the codebase disagrees with itself about the
    // externally-owned view, so this case is handled defensively.
    //
    // HONEST SCOPE OF THIS TEST: it pins the FIGURE, not the mechanism. A null
    // id reaches the total by two converging routes — the explicit guard, and
    // the orphan sweep (a null map key matches no registered client either) — so
    // removing the guard does not move this number. What it does catch is a null
    // row being dropped entirely, or bucketed under a registered client.
    state.biRows = [
      post({ linkedin_post_id: "a", client_id: null as unknown as string }),
      post({ linkedin_post_id: "b", client_id: "c1" }),
    ];

    const { unattributedPosts, rows } = await getDataQuality({ now: NOW });

    expect(unattributedPosts).toBe(1);
    // Counted ONCE, and not charged to a real client.
    expect(rows.find((r) => r.clientId === "c1")!.attributed).toBe(1);
  });

  it("reports a real 0 when every post is attributed to a registered client", async () => {
    state.biRows = [post({ linkedin_post_id: "a", client_id: "c1" })];

    const { unattributedPosts } = await getDataQuality({ now: NOW });

    expect(unattributedPosts).toBe(0);
    expect(unattributedPosts).not.toBeNull();
  });
});

describe("getDataQuality — the three source states stay apart", () => {
  it("marks posts UNAVAILABLE, and unattributed unknown, when the bi read fails", async () => {
    state.biError = { message: "permission denied for schema bi" };

    const { sources, unattributedPosts, rows } = await getDataQuality({ now: NOW });

    expect(sources.postsUnavailable).toBe(true);
    expect(sources.postsTruncated).toBe(false);
    // Not 0 — a failed read is not a confident "everything is attributed".
    expect(unattributedPosts).toBeNull();
    // The roster still renders; the post columns simply have nothing behind them.
    expect(rows).toHaveLength(2);
  });

  it("marks posts TRUNCATED — available, real, but a lower bound", async () => {
    state.biRows = Array.from({ length: PAGE_SIZE }, (_, i) =>
      post({ linkedin_post_id: `p${i}`, client_id: "c1" }),
    );
    state.biCountOverride = MAX_PAGES * PAGE_SIZE + 1;

    const { sources } = await getDataQuality({ now: NOW });

    // Distinct from unavailable: the rows ARE real, there are just more of them
    // than were read, so every figure is a floor rather than a total.
    expect(sources.postsTruncated).toBe(true);
    expect(sources.postsUnavailable).toBe(false);
  });

  it("reports submitted as UNKNOWN — never 0 — when the uploads read fails", async () => {
    state.uploadsError = { message: "permission denied" };

    const { rows, sources } = await getDataQuality({ now: NOW });

    expect(sources.uploadsUnavailable).toBe(true);
    // ⚠️ A 0 here would assert that nothing was ever submitted, which is exactly
    // the "unknown vs confirmed zero" collapse this repo has fixed twice.
    expect(rows[0]!.submitted).toBeNull();
    expect(rows[0]!.uploadCount).toBeNull();
    expect(rows[0]!.lastIngest).toBe("unavailable");
  });

  it("marks the client roster unavailable and lists nothing rather than guessing", async () => {
    state.clientsError = { message: "permission denied" };

    const { rows, sources, unattributedPosts } = await getDataQuality({ now: NOW });

    expect(sources.clientsUnavailable).toBe(true);
    expect(rows).toEqual([]);
    // Without a roster there is nothing to call an orphan.
    expect(unattributedPosts).toBeNull();
  });

  it("reports every source healthy for a clean read", async () => {
    state.biRows = [post({ linkedin_post_id: "a", client_id: "c1" })];
    state.uploads = [upload("c1", "2026-07-20T09:00:00.000Z", 1)];

    const { sources } = await getDataQuality({ now: NOW });

    expect(sources).toEqual({
      clientsUnavailable: false,
      postsUnavailable: false,
      postsTruncated: false,
      uploadsUnavailable: false,
    });
  });

  it("does NOT read post counts a second time — every figure comes from ONE bi read", async () => {
    // ⚠️ Guarding the rule, not the wiring: `listClients` would join a SECOND,
    // independent bi count, and two counts of the same thing on one screen is
    // how a page comes to contradict itself. If this row's `attributed` ever
    // stops matching the bi fixture, a second source crept in.
    state.biRows = [
      post({ linkedin_post_id: "a", client_id: "c1" }),
      post({ linkedin_post_id: "b", client_id: "c1" }),
    ];

    const { rows } = await getDataQuality({ now: NOW });

    expect(rows.find((r) => r.clientId === "c1")!.attributed).toBe(2);
  });
});

describe("severity ordering — worst first", () => {
  const row = (over: Partial<Parameters<typeof severityRank>[0]>) => ({
    clientId: "c",
    clientName: "C",
    submitted: 0,
    attributed: 0,
    undated: 0,
    unknownFormat: 0,
    uploadCount: 0,
    lastIngest: "2026-07-23T09:00:00.000Z" as string | null | "unavailable",
    ...over,
  });

  it("ranks submitted-but-never-attributed above everything else", () => {
    expect(severityRank(row({ submitted: 40, attributed: 0 }), NOW)).toBe(1);
  });

  it("ranks a never-ingested client next", () => {
    expect(severityRank(row({ lastIngest: null }), NOW)).toBe(2);
  });

  it(`ranks an ingest older than ${STALE_AFTER_DAYS} days as stale`, () => {
    const stale = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 1) * 86_400_000).toISOString();
    const fresh = new Date(NOW.getTime() - (STALE_AFTER_DAYS - 1) * 86_400_000).toISOString();

    expect(severityRank(row({ lastIngest: stale }), NOW)).toBe(3);
    // The boundary matters: one day inside the window is NOT stale.
    expect(severityRank(row({ lastIngest: fresh }), NOW)).toBe(5);
  });

  it("ranks undated or unknown-type posts below staleness", () => {
    expect(severityRank(row({ undated: 3 }), NOW)).toBe(4);
    expect(severityRank(row({ unknownFormat: 1 }), NOW)).toBe(4);
  });

  it("ranks a healthy client last", () => {
    expect(severityRank(row({ submitted: 10, attributed: 10 }), NOW)).toBe(5);
  });

  it("does NOT rank on submitted-vs-attributed when submitted is UNKNOWN", () => {
    // `null` means the uploads read could not be trusted — the comparison cannot
    // be made at all, which is different from it having passed.
    expect(severityRank(row({ submitted: null, attributed: 0 }), NOW)).toBe(5);
  });

  it("orders the table worst-first, breaking ties by client name", async () => {
    state.clients = [
      { id: "healthy", name: "Zoe Healthy" },
      { id: "silent", name: "Sam Silent" },
      { id: "never", name: "Nia Never" },
      { id: "alsoNever", name: "Abe Never" },
    ];
    state.uploads = [
      upload("silent", "2026-07-20T09:00:00.000Z", 40),
      upload("healthy", "2026-07-20T09:00:00.000Z", 1),
    ];
    state.biRows = [post({ linkedin_post_id: "a", client_id: "healthy" })];

    const { rows } = await getDataQuality({ now: NOW });

    expect(rows.map((r) => r.clientId)).toEqual([
      "silent", // rank 1 — submitted 40, attributed 0
      "alsoNever", // rank 2, "Abe" before "Nia"
      "never", // rank 2
      "healthy", // rank 5
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ENGAGEMENT-RATE RECONCILIATION.
//
// ArcBase holds THREE rate definitions: the scraper's `provided_engagement_rate`,
// the view's `calculated_engagement_rate` (the one it ships), and its own
// aggregate `weightedRate` on the dashboard. These tests pin what the
// reconciliation REPORTS — never that it resolves anything. Nothing here averages
// two rates or picks a winner.
// ─────────────────────────────────────────────────────────────────────────────
describe("reconcileRates", () => {
  const rated = (over: Partial<BiPostRow>) =>
    post({ impressions: 1000, interactions: 62, ...over });

  it("counts posts the view carries NO rate for — distinct from a rate of 0", () => {
    const result = reconcileRates([
      rated({ linkedin_post_id: "a", calculated_engagement_rate: 6.2 }),
      rated({ linkedin_post_id: "b", calculated_engagement_rate: null }),
      // A real, measured zero. NOT missing.
      rated({ linkedin_post_id: "c", calculated_engagement_rate: 0, interactions: 0 }),
    ]);

    expect(result.postsMissingRate).toBe(1);
  });

  it("counts a disagreement only where BOTH rates are present", () => {
    const result = reconcileRates([
      // Agree.
      rated({
        linkedin_post_id: "a",
        provided_engagement_rate: 6.2,
        calculated_engagement_rate: 6.2,
      }),
      // Disagree, well past tolerance.
      rated({
        linkedin_post_id: "b",
        provided_engagement_rate: 9.9,
        calculated_engagement_rate: 6.2,
      }),
      // Only one side present — an absence is not a disagreement.
      rated({
        linkedin_post_id: "c",
        provided_engagement_rate: null,
        calculated_engagement_rate: 6.2,
      }),
      rated({
        linkedin_post_id: "d",
        provided_engagement_rate: 6.2,
        calculated_engagement_rate: null,
      }),
    ]);

    expect(result.rateDisagreements).toBe(1);
    expect(result.rateComparablePosts).toBe(2);
  });

  it("treats a difference within tolerance as agreement", () => {
    const withinTolerance = RATE_TOLERANCE_PCT / 2;
    const result = reconcileRates([
      rated({
        linkedin_post_id: "a",
        provided_engagement_rate: 6.2,
        calculated_engagement_rate: 6.2 + withinTolerance,
      }),
    ]);

    // Rounding and float noise must not read as a definitional difference.
    expect(result.rateDisagreements).toBe(0);
  });

  // ⚠️ THE FIGURE THAT STOPS A UNIT DIFFERENCE READING AS A CATASTROPHE.
  it("reports a median ratio near 100 when the two columns are on different SCALES", () => {
    // The classic mismatch: one column a percentage (6.2), the other a fraction
    // (0.062). EVERY row "disagrees", but nothing is actually wrong — the
    // columns are simply in different units.
    const result = reconcileRates(
      [6.2, 3.1, 12.4].map((pct, i) =>
        rated({
          linkedin_post_id: `p${i}`,
          provided_engagement_rate: pct,
          calculated_engagement_rate: pct / 100,
        }),
      ),
    );

    expect(result.rateDisagreements).toBe(3); // every row
    // ...but the ratio says "unit mismatch", not "the numbers are wrong".
    expect(result.rateMedianRatio).toBeCloseTo(100, 0);
  });

  it("reports a median ratio near 1 when the disagreement is GENUINE", () => {
    // Same scale, different numbers — the case that actually warrants a question
    // to the BI owner. The ratio is what tells these two situations apart.
    const result = reconcileRates([
      rated({
        linkedin_post_id: "a",
        provided_engagement_rate: 6.4,
        calculated_engagement_rate: 6.2,
      }),
      rated({
        linkedin_post_id: "b",
        provided_engagement_rate: 3.0,
        calculated_engagement_rate: 3.1,
      }),
      rated({
        linkedin_post_id: "c",
        provided_engagement_rate: 12.9,
        calculated_engagement_rate: 12.4,
      }),
    ]);

    expect(result.rateDisagreements).toBe(3);
    expect(result.rateMedianRatio).toBeCloseTo(1, 1);
  });

  it("excludes a zero calculated rate from the ratio rather than dividing by it", () => {
    const result = reconcileRates([
      rated({
        linkedin_post_id: "a",
        provided_engagement_rate: 6.2,
        calculated_engagement_rate: 6.2,
      }),
      // Would be Infinity and would poison the median.
      rated({ linkedin_post_id: "b", provided_engagement_rate: 5, calculated_engagement_rate: 0 }),
    ]);

    expect(result.rateMedianRatio).toBeCloseTo(1, 5);
    expect(Number.isFinite(result.rateMedianRatio!)).toBe(true);
    // Still COMPARABLE — it just cannot contribute a ratio.
    expect(result.rateComparablePosts).toBe(2);
  });

  it("reports a null median ratio when nothing is comparable", () => {
    const result = reconcileRates([
      rated({ linkedin_post_id: "a", provided_engagement_rate: null }),
    ]);

    // Not 0 and not 1 — there is genuinely no ratio to report.
    expect(result.rateMedianRatio).toBeNull();
  });

  // ⚠️ THE ANSWER TO "IS THE DASHBOARD'S ENGAGEMENT FIGURE TRUSTWORTHY?"
  describe("aggregateFormulaMatches", () => {
    it("is TRUE when the view's per-post rate is interactions / impressions", () => {
      const result = reconcileRates([
        // 62 / 1000 = 6.2%
        rated({
          linkedin_post_id: "a",
          impressions: 1000,
          interactions: 62,
          calculated_engagement_rate: 6.2,
        }),
        // 15 / 500 = 3%
        rated({
          linkedin_post_id: "b",
          impressions: 500,
          interactions: 15,
          calculated_engagement_rate: 3,
        }),
      ]);

      expect(result.aggregateFormulaMatches).toBe(true);
      expect(result.formulaCheckedPosts).toBe(2);
    });

    it("is FALSE when the view computes its rate over some other basis", () => {
      // E.g. a view dividing by followers, or excluding saves from the numerator.
      // Whatever the cause, the dashboard aggregate and this column would then be
      // measuring different things under one word — which is the finding.
      const result = reconcileRates([
        rated({
          linkedin_post_id: "a",
          impressions: 1000,
          interactions: 62,
          calculated_engagement_rate: 6.2,
        }),
        rated({
          linkedin_post_id: "b",
          impressions: 1000,
          interactions: 62,
          calculated_engagement_rate: 2.9,
        }),
      ]);

      expect(result.aggregateFormulaMatches).toBe(false);
    });

    it("is NULL — not true — when no post can be checked", () => {
      // Zero impressions everywhere: no post has a defensible rate under any
      // formula, so the check did not pass, it did not RUN.
      const result = reconcileRates([
        rated({
          linkedin_post_id: "a",
          impressions: 0,
          interactions: 0,
          calculated_engagement_rate: 0,
        }),
      ]);

      expect(result.aggregateFormulaMatches).toBeNull();
      expect(result.formulaCheckedPosts).toBe(0);
    });

    it("skips posts with no rate rather than counting them as a mismatch", () => {
      const result = reconcileRates([
        rated({
          linkedin_post_id: "a",
          impressions: 1000,
          interactions: 62,
          calculated_engagement_rate: 6.2,
        }),
        rated({
          linkedin_post_id: "b",
          impressions: 1000,
          interactions: 999,
          calculated_engagement_rate: null,
        }),
      ]);

      expect(result.formulaCheckedPosts).toBe(1);
      expect(result.aggregateFormulaMatches).toBe(true);
    });

    // ⚠️ `interactions` IS NULLABLE, AND AN ABSENT ONE IS NOT A ZERO. Coercing it
    // computes a 0% rate that disagrees with any real rate — reporting a MISSING
    // measurement as a definitional difference, in the one figure on this screen
    // staff would actually act on.
    it("skips a post with NO interactions rather than scoring it as a mismatch", () => {
      const result = reconcileRates([
        rated({
          linkedin_post_id: "a",
          impressions: 1000,
          interactions: null,
          calculated_engagement_rate: 6.2,
        }),
      ]);

      // Not checkable: with no numerator there is no rate to compare against.
      expect(result.formulaCheckedPosts).toBe(0);
      expect(result.formulaMismatches).toBe(0);
      // So the verdict is "could not be checked", NOT "does not match".
      expect(result.aggregateFormulaMatches).toBeNull();
    });

    it("does not let one unmeasured post overturn a book of matching ones", () => {
      // How the defect compounded: the verdict is strict, so a single post
      // scored as a mismatch for want of a numerator flipped the whole panel.
      const result = reconcileRates([
        ...[1, 2, 3].map((i) =>
          rated({
            linkedin_post_id: `ok${i}`,
            impressions: 1000,
            interactions: 62,
            calculated_engagement_rate: 6.2,
          }),
        ),
        rated({
          linkedin_post_id: "unmeasured",
          impressions: 1000,
          interactions: null,
          calculated_engagement_rate: 6.2,
        }),
      ]);

      expect(result.aggregateFormulaMatches).toBe(true);
      expect(result.formulaCheckedPosts).toBe(3);
    });

    // ⚠️ AND THE FIX MUST NOT OVERSHOOT. A measured zero IS a measurement: the
    // post genuinely earned nothing, so its rate genuinely is 0% and a non-zero
    // column genuinely disagrees. Excluding it would be the same collapse
    // pointed the other way.
    it("still checks a post whose interactions are a genuine 0", () => {
      const result = reconcileRates([
        rated({
          linkedin_post_id: "a",
          impressions: 1000,
          interactions: 0,
          calculated_engagement_rate: 6.2,
        }),
      ]);

      expect(result.formulaCheckedPosts).toBe(1);
      expect(result.formulaMismatches).toBe(1);
      expect(result.aggregateFormulaMatches).toBe(false);
    });

    it("counts a genuine 0 as a MATCH when the view also reports 0", () => {
      const result = reconcileRates([
        rated({
          linkedin_post_id: "a",
          impressions: 1000,
          interactions: 0,
          calculated_engagement_rate: 0,
        }),
      ]);

      expect(result.formulaCheckedPosts).toBe(1);
      expect(result.formulaMismatches).toBe(0);
      expect(result.aggregateFormulaMatches).toBe(true);
    });

    // ⚠️ A VERDICT WITHOUT ITS DENOMINATOR IS AN ALARM, NOT A FINDING. One post
    // in a thousand and a thousand in a thousand both read `false`; only the
    // count tells a reader which of the two they are looking at.
    it("reports HOW MANY posts mismatched, not merely that one did", () => {
      const result = reconcileRates([
        ...[1, 2, 3].map((i) =>
          rated({
            linkedin_post_id: `ok${i}`,
            impressions: 1000,
            interactions: 62,
            calculated_engagement_rate: 6.2,
          }),
        ),
        rated({
          linkedin_post_id: "odd",
          impressions: 1000,
          interactions: 62,
          calculated_engagement_rate: 2.9,
        }),
      ]);

      expect(result.formulaMismatches).toBe(1);
      expect(result.formulaCheckedPosts).toBe(4);
      // The flag stays STRICT — one disagreement is still a disagreement. The
      // count SIZES the finding; it does not soften it.
      expect(result.aggregateFormulaMatches).toBe(false);
    });
  });

  it("is reachable from getDataQuality over every post read", async () => {
    state.biRows = [
      post({
        linkedin_post_id: "a",
        client_id: "c1",
        impressions: 1000,
        interactions: 62,
        provided_engagement_rate: 6.2,
        calculated_engagement_rate: 6.2,
      }),
    ];

    const { rates } = await getDataQuality({ now: NOW });

    expect(rates.aggregateFormulaMatches).toBe(true);
    expect(rates.rateDisagreements).toBe(0);
    expect(rates.postsMissingRate).toBe(0);
  });
});
