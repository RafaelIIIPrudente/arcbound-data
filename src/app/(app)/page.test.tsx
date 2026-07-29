import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RangeSelection } from "@/lib/date-range";
import type { DashboardAnalytics } from "@/services/types";

// ── Hermetic: the page's two reads are mocked, so this is purely about which
// WINDOW the page resolves from the URL and hands to the seam. ────────────────
const { state } = vi.hoisted(() => ({
  state: { calls: [] as { range: RangeSelection }[] },
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
    return Promise.resolve(EMPTY);
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
