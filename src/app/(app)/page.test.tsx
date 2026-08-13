import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RangeSelection } from "@/lib/date-range";
import type { DashboardAnalytics } from "@/services/types";

// ── Hermetic: the page's two reads are mocked, so this is purely about which
// WINDOW the page resolves from the URL and hands to the seam. ────────────────
const { state } = vi.hoisted(() => ({
  state: {
    calls: [] as { range: RangeSelection }[],
    // Null means "the empty analytics below" — every pre-existing test relies on
    // that default, so the drill-through tests opt IN to a populated dashboard
    // rather than changing what the others see.
    analytics: null as DashboardAnalytics | null,
  },
}));

const EMPTY: DashboardAnalytics = {
  totalPosts: 0,
  lastSync: "—",
  hero: { label: "Impressions", value: 0, delta: 0, direction: "up" },
  kpis: [],
  engagement: { value: 0, delta: 0 },
  impressionsSeries: [],
  engagementSeries: [],
  impressionsByWeekday: [],
  weekdayUndatedPosts: 0,
  recentPosts: [],
};

vi.mock("@/services/analytics", () => ({
  getDashboardAnalytics: (opts: { range: RangeSelection }) => {
    state.calls.push({ range: opts.range });
    return Promise.resolve(state.analytics ?? EMPTY);
  },
}));
vi.mock("@/services/clients", () => ({ listClientRegistry: () => Promise.resolve([]) }));

import DashboardPage from "./page";

/** The window the page resolved from `?range=` and actually rendered. */
async function windowFor(range?: string): Promise<RangeSelection> {
  state.calls = [];
  await DashboardPage({ searchParams: Promise.resolve(range === undefined ? {} : { range }) });
  return state.calls[0]!.range;
}

beforeEach(() => {
  state.calls = [];
  state.analytics = null;
});

describe("the dashboard reads ?range= as a window — the URL is untrusted input", () => {
  it("defaults to 30 days when the param is absent", async () => {
    await expect(windowFor()).resolves.toEqual({ kind: "preset", days: 30 });
  });

  it("resolves each preset the filter bar offers", async () => {
    await expect(windowFor("7d")).resolves.toEqual({ kind: "preset", days: 7 });
    await expect(windowFor("30d")).resolves.toEqual({ kind: "preset", days: 30 });
    await expect(windowFor("90d")).resolves.toEqual({ kind: "preset", days: 90 });
  });

  it("resolves all-time", async () => {
    await expect(windowFor("all")).resolves.toEqual({ kind: "all" });
  });

  it("resolves a custom window", async () => {
    await expect(windowFor("2026-01-01..2026-02-15")).resolves.toEqual({
      kind: "custom",
      startDay: "2026-01-01",
      endDay: "2026-02-15",
    });
  });

  it("falls back to the default for anything it cannot read", async () => {
    for (const token of [
      "",
      "garbage",
      "45d", // well-formed, and not a preset this surface offers
      "0d",
      "2026-02-15..2026-01-01", // inverted
      "2026-13-01..2026-12-31", // not a calendar day
      "2026-1-01..2026-02-15", // unpadded
      "custom:2026-01-01..2026-02-15", // the report's dialect, not this one
    ]) {
      await expect(windowFor(token), token).resolves.toEqual({ kind: "preset", days: 30 });
    }
  });

  // ── the one that is easy to get wrong ──────────────────────────────────────
  it("REFUSES a window ending after today, and does NOT clamp it", async () => {
    // ⚠️ CLAMPING WOULD DISTORT THE BASELINE. Trimming the window to today while
    // `resolveWindow` still baselines it on the full DECLARED span compares a
    // short period against a long one and reports the shortfall as a change.
    // `resolveWindow` deliberately does not clamp either, so this is the ONLY
    // gate — and the honest answer is to refuse the token outright.
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

    await expect(windowFor(`2026-01-01..${nextYear}`)).resolves.toEqual({
      kind: "preset",
      days: 30,
    });
  });

  it("accepts a window ending TODAY — today is not the future", async () => {
    const today = new Date().toISOString().slice(0, 10);

    await expect(windowFor(`2026-01-01..${today}`)).resolves.toEqual({
      kind: "custom",
      startDay: "2026-01-01",
      endDay: today,
    });
  });

  it("accepts a window that ENDED IN THE PAST", async () => {
    // Worth pinning: under the retired `now − 2 × span` read bound this window
    // could not be served at all, because both its periods sit further back.
    await expect(windowFor("2020-03-01..2020-04-01")).resolves.toEqual({
      kind: "custom",
      startDay: "2020-03-01",
      endDay: "2020-04-01",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DRILL-THROUGH: from the KPI figures to the posts behind them.
//
// ⚠️ THESE ASSERT THE HREF, NOT THE COPY. The hazard this affordance carries is
// that `parseReportPeriod` never errors on a token it cannot read — it falls
// back to the newest MONTH — so a wrong `?period=` lands the reader on a
// plausible table of the wrong posts. The WINDOW that token resolves to is
// pinned in `src/lib/date-range.test.ts`; what is pinned here is that the page
// actually emits it, and that the all-clients state points somewhere honest.
// ─────────────────────────────────────────────────────────────────────────────

describe("the dashboard opens the posts behind its figures", () => {
  /** A dashboard with data — the empty state renders no figures to drill into. */
  const POPULATED: DashboardAnalytics = { ...EMPTY, totalPosts: 12 };

  /**
   * Every `href` in the tree the page returned.
   *
   * Walks the returned elements rather than mounting them: the page is a Server
   * Component whose children carry "use client", and the question here is which
   * URL it emitted, which the element tree answers directly.
   */
  function hrefsFrom(node: ReactNode): string[] {
    if (Array.isArray(node)) return node.flatMap(hrefsFrom);
    if (!isValidElement(node)) return [];
    const props = node.props as { href?: unknown; children?: ReactNode };
    return [...(typeof props.href === "string" ? [props.href] : []), ...hrefsFrom(props.children)];
  }

  async function hrefsFor(searchParams: { client?: string; range?: string }) {
    state.analytics = POPULATED;
    return hrefsFrom(await DashboardPage({ searchParams: Promise.resolve(searchParams) }));
  }

  it("points at THIS client's posts, in the window on screen", async () => {
    const hrefs = await hrefsFor({ client: "c-1", range: "2026-01-01..2026-02-15" });

    expect(hrefs).toContain("/clients/c-1/posts?period=custom:2026-01-01..2026-02-15");
  });

  it("spells a PRESET as the run of days it covers, never as `30d`", async () => {
    // ⚠️ `?period=30d` is not a period on the posts screen at all — it decodes
    // with `presets: []` — so it would silently land on the newest month.
    const [posts] = (await hrefsFor({ client: "c-1", range: "7d" })).filter((h) =>
      h.includes("/posts"),
    );
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);

    expect(posts).toBe(`/clients/c-1/posts?period=custom:${start}..${today}`);
  });

  it("passes all-time through as `all`, not as a window", async () => {
    const hrefs = await hrefsFor({ client: "c-1", range: "all" });

    expect(hrefs).toContain("/clients/c-1/posts?period=all");
  });

  it("points at the CLIENT LIST when no client is selected — there is no one posts page", async () => {
    // ⚠️ NOT a `?client=`-threaded posts URL: which client a drill-through should
    // default to is a parked product decision, and guessing one would show one
    // client's posts under a figure covering the whole book.
    const hrefs = await hrefsFor({ range: "30d" });

    expect(hrefs).toContain("/clients");
    expect(hrefs.some((h) => h.includes("/posts"))).toBe(false);
  });

  it("says which client's posts it opens ONLY when it is opening a client's posts", async () => {
    const copy = (node: ReactNode): string =>
      Array.isArray(node)
        ? node.map(copy).join(" ")
        : isValidElement(node)
          ? copy((node.props as { children?: ReactNode }).children)
          : typeof node === "string"
            ? node
            : "";

    state.analytics = POPULATED;
    const all = copy(await DashboardPage({ searchParams: Promise.resolve({ range: "30d" }) }));

    // The list is not this client's posts, and must not claim to be.
    expect(all).toMatch(/choose a client/i);
    expect(all).not.toMatch(/view (these|this client's) posts/i);
  });
});
