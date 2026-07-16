import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the Supabase server client + cookies so nothing hits the DB. ─
const { biState } = vi.hoisted(() => ({
  biState: {
    rows: [] as unknown[],
    error: null as { message: string } | null,
    eqCalls: [] as unknown[][],
    schemaCalls: [] as string[],
    fromCalls: [] as string[],
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (...a: unknown[]) => {
      biState.eqCalls.push(a);
      return chain;
    };
    chain.or = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: biState.rows, error: biState.error }).then(resolve);
    return {
      schema: (s: string) => {
        biState.schemaCalls.push(s);
        return {
          from: (t: string) => {
            biState.fromCalls.push(t);
            return chain;
          },
        };
      },
    };
  },
}));

import { buildDashboardAnalytics, getDashboardAnalytics, type BiPostRow } from "./analytics";

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

describe("buildDashboardAnalytics (pure)", () => {
  it("sums the current window and computes deltas vs the prior window", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });

    // Current window (Jul 1 + Jul 10) impressions = 1500; prior (May 20) = 600.
    expect(a.hero).toEqual({ label: "Impressions", value: 1500, delta: 150, direction: "up" });
    expect(a.kpis.map((k) => k.label)).toEqual(["Likes", "Comments", "Reposts", "Saves"]);
    const likes = a.kpis.find((k) => k.label === "Likes")!;
    expect(likes.value).toBe(140);
    expect(likes.direction).toBe("up");
    const saves = a.kpis.find((k) => k.label === "Saves")!;
    expect(saves.value).toBe(3); // grew from 0 in prior window
    expect(saves.direction).toBe("up");
  });

  it("computes the weighted engagement rate and a signed points delta", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    // interactions 166 / impressions 1500 * 100 = 11.07; prior 36/600*100 = 6.0.
    expect(a.engagement.value).toBeCloseTo(11.1, 1);
    expect(a.engagement.delta).toBeCloseTo(5.1, 1);
  });

  it("counts the window, picks recent posts, and formats lastSync", () => {
    const a = buildDashboardAnalytics(ROWS, { range: "30d", now: NOW });
    expect(a.totalPosts).toBe(2); // hour-age (null date) is excluded from the window
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
    expect(a.impressionsSeries.reduce((s, p) => s + p.value, 0)).toBe(1500);
    expect(a.engagementSeries).toHaveLength(5);

    expect(buildDashboardAnalytics(ROWS, { range: "7d", now: NOW }).impressionsSeries).toHaveLength(
      7,
    );
    expect(
      buildDashboardAnalytics(ROWS, { range: "90d", now: NOW }).impressionsSeries,
    ).toHaveLength(3);
  });

  it("yields an empty dashboard when the current window has no posts", () => {
    const priorOnly = [ROWS[2]!, ROWS[3]!]; // May post + null-date hour-age only
    const a = buildDashboardAnalytics(priorOnly, { range: "30d", now: NOW });
    expect(a.totalPosts).toBe(0);
    expect(a.hero.value).toBe(0);
    expect(a.engagement.value).toBe(0);
    expect(a.recentPosts).toEqual([]);
  });
});

describe("getDashboardAnalytics (seam → bi.linkedin_post_latest)", () => {
  beforeEach(() => {
    biState.rows = [];
    biState.error = null;
    biState.eqCalls = [];
    biState.schemaCalls = [];
    biState.fromCalls = [];
  });

  it("reads the bi view and returns a well-formed analytics", async () => {
    biState.rows = ROWS;
    const a = await getDashboardAnalytics({ range: "30d" });

    expect(biState.schemaCalls).toContain("bi");
    expect(biState.fromCalls).toContain("linkedin_post_latest");
    expect(a.hero.label).toBe("Impressions");
    expect(a.kpis.map((k) => k.label)).toEqual(["Likes", "Comments", "Reposts", "Saves"]);
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
