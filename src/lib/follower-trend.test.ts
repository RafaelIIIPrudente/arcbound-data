import { describe, expect, it } from "vitest";

import type { Upload } from "@/services/types";

import { followerTrend } from "./follower-trend";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ FOUR STATES THAT MUST NOT COLLAPSE INTO EACH OTHER: a failed read, a
// history that never recorded a count, a single reading, and a trend. Three of
// them have no movement to report, and each has a DIFFERENT reason — "we could
// not look", "nothing was ever written down", and "one reading is a level, not
// a direction". Rendering any of them as 0% would invent a finding.
// ─────────────────────────────────────────────────────────────────────────────

/** `listUploads` returns NEWEST FIRST, so fixtures are written that way. */
function upload(over: Partial<Upload> = {}): Upload {
  return {
    id: "u",
    clientId: "c1",
    sourceType: "csv",
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("followerTrend — the states stay apart", () => {
  it("reports a FAILED READ as its own state, never as no growth", () => {
    // `listUploads` returns null when the read failed. Nothing is known — which
    // is not the same as knowing nothing changed.
    expect(followerTrend(null)).toEqual({ kind: "unavailable" });
  });

  it("reports a history with no recorded count as NOTHING RECORDED", () => {
    const result = followerTrend([
      upload({ id: "a", createdAt: "2026-07-01T00:00:00.000Z" }),
      upload({ id: "b", createdAt: "2026-06-01T00:00:00.000Z" }),
    ]);

    expect(result).toEqual({ kind: "none" });
  });

  it("reports an empty history as nothing recorded, not as a failed read", () => {
    expect(followerTrend([])).toEqual({ kind: "none" });
  });

  // ⚠️ THE STATE MOST LIKELY TO BE GOT WRONG. One point is a LEVEL. It has no
  // direction, no net change, and no percentage — a second reading is what
  // creates a trend, and inventing one from a single point is the whole defect
  // this state exists to prevent.
  it("reports a single recorded count as a LEVEL, carrying no movement at all", () => {
    const result = followerTrend([
      upload({ id: "a", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1200 }),
      upload({ id: "b", createdAt: "2026-06-01T00:00:00.000Z" }),
    ]);

    expect(result).toEqual({
      kind: "single",
      latest: { followers: 1200, at: "2026-07-01T00:00:00.000Z" },
    });
    // Not a trend under any reading of the result.
    expect(result).not.toHaveProperty("net");
    expect(result).not.toHaveProperty("percent");
    expect(result).not.toHaveProperty("series");
  });

  it("becomes a trend only on the SECOND recorded count", () => {
    const one = followerTrend([
      upload({ id: "a", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1200 }),
    ]);
    const two = followerTrend([
      upload({ id: "a", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1200 }),
      upload({ id: "b", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1000 }),
    ]);

    expect(one.kind).toBe("single");
    expect(two.kind).toBe("trend");
  });
});

describe("followerTrend — the series", () => {
  it("orders every recorded point OLDEST FIRST, each with the time it was recorded", () => {
    // The input arrives newest first; a time series reads forwards.
    const result = followerTrend([
      upload({ id: "c", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1400 }),
      upload({ id: "b", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1200 }),
      upload({ id: "a", createdAt: "2026-05-01T00:00:00.000Z", followerCount: 1000 }),
    ]);

    expect(result).toMatchObject({
      kind: "trend",
      series: [
        { followers: 1000, at: "2026-05-01T00:00:00.000Z" },
        { followers: 1200, at: "2026-06-01T00:00:00.000Z" },
        { followers: 1400, at: "2026-07-01T00:00:00.000Z" },
      ],
    });
  });

  // ⚠️ TWO READINGS ON ONE DAY IS A FACT ABOUT THE HISTORY. Collapsing them
  // hides a real second observation.
  it("plots same-day uploads as two points rather than de-duplicating them", () => {
    const result = followerTrend([
      upload({ id: "b", createdAt: "2026-07-01T18:00:00.000Z", followerCount: 1210 }),
      upload({ id: "a", createdAt: "2026-07-01T09:00:00.000Z", followerCount: 1200 }),
    ]);

    expect(result).toMatchObject({ kind: "trend" });
    expect(result.kind === "trend" && result.series).toHaveLength(2);
    // Same calendar day, so the span really is zero — an honest 0, not a gap.
    expect(result.kind === "trend" && result.spanDays).toBe(0);
  });

  // ⚠️ A MISSING COUNT IS NOT A DROP TO NOTHING. `followersDelta` already skips
  // them; this must agree, or the card and the chart would tell two stories.
  it("skips uploads with no follower count instead of reading them as zero", () => {
    const result = followerTrend([
      upload({ id: "d", createdAt: "2026-07-01T00:00:00.000Z" }),
      upload({ id: "c", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1200 }),
      upload({ id: "b", createdAt: "2026-05-01T00:00:00.000Z", followerCount: 1000 }),
      upload({ id: "a", createdAt: "2026-04-01T00:00:00.000Z" }),
    ]);

    expect(result).toMatchObject({
      kind: "trend",
      series: [
        { followers: 1000, at: "2026-05-01T00:00:00.000Z" },
        { followers: 1200, at: "2026-06-01T00:00:00.000Z" },
      ],
      net: 200,
    });
    // ⚠️ THE SPAN IS BETWEEN THE RECORDED POINTS, not across the whole upload
    // history: 1 May → 1 June, not 1 April → 1 July.
    expect(result.kind === "trend" && result.spanDays).toBe(31);
  });

  it("measures the span over the interval actually observed", () => {
    const result = followerTrend([
      upload({ id: "b", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1400 }),
      upload({ id: "a", createdAt: "2026-04-01T00:00:00.000Z", followerCount: 1000 }),
    ]);

    expect(result.kind === "trend" && result.spanDays).toBe(91);
  });
});

describe("followerTrend — the movement", () => {
  it("reports growth as a signed net change and a percentage of the OLDEST count", () => {
    const result = followerTrend([
      upload({ id: "b", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1250 }),
      upload({ id: "a", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1000 }),
    ]);

    expect(result).toMatchObject({ kind: "trend", net: 250 });
    expect(result.kind === "trend" && result.percent).toBeCloseTo(25, 10);
  });

  // ⚠️ A DECLINE IS A FINDING, NOT AN ERROR. It keeps its minus sign; no
  // `Math.abs` anywhere, or a loss reads as a gain.
  it("reports a decline as a NEGATIVE net change and a negative percentage", () => {
    const result = followerTrend([
      upload({ id: "b", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 800 }),
      upload({ id: "a", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1000 }),
    ]);

    expect(result).toMatchObject({ kind: "trend", net: -200 });
    expect(result.kind === "trend" && result.percent).toBeCloseTo(-20, 10);
  });

  it("reports a genuinely unchanged count as a net of 0, which is a measurement", () => {
    const result = followerTrend([
      upload({ id: "b", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1000 }),
      upload({ id: "a", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1000 }),
    ]);

    expect(result).toMatchObject({ kind: "trend", net: 0, percent: 0 });
  });

  // ⚠️ A PERCENTAGE OF NOTHING IS UNDEFINED. Not Infinity, not 100 — growth from
  // zero has no meaningful denominator, and the UI has to say so.
  it("reports percent as NULL when the oldest recorded count is 0", () => {
    const result = followerTrend([
      upload({ id: "b", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 500 }),
      upload({ id: "a", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 0 }),
    ]);

    // The net change is still perfectly reportable.
    expect(result).toMatchObject({ kind: "trend", net: 500, percent: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE PAGE MUST NOT CONTRADICT ITSELF. The Followers KPI card shows the
// NEWEST upload's count. If the series ended on a different figure, the same
// screen would state two current follower counts.
// ─────────────────────────────────────────────────────────────────────────────
describe("followerTrend agrees with the Followers KPI card", () => {
  it("ends the series on the same figure the card reads from", () => {
    const uploads = [
      upload({ id: "c", createdAt: "2026-07-01T00:00:00.000Z", followerCount: 1400 }),
      upload({ id: "b", createdAt: "2026-06-01T00:00:00.000Z", followerCount: 1200 }),
      upload({ id: "a", createdAt: "2026-05-01T00:00:00.000Z", followerCount: 1000 }),
    ];

    // Exactly what `src/app/(app)/clients/[id]/page.tsx` renders on the card.
    const cardValue = uploads[0]!.followerCount;
    const result = followerTrend(uploads);

    expect(result.kind).toBe("trend");
    expect(result.kind === "trend" && result.series.at(-1)!.followers).toBe(cardValue);
  });
});
