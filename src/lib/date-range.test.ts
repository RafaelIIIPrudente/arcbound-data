import { describe, expect, it } from "vitest";

import type { BiPostRow } from "@/services/analytics";
import { periodRange } from "@/services/bi-posts";
import { CUSTOM_PREFIX, availablePeriods, parseReportPeriod } from "@/services/client-report";

import {
  DAILY_MAX_DAYS,
  WEEKLY_MAX_DAYS,
  bucketLabel,
  bucketPlan,
  decodeRange,
  encodeRange,
  resolveWindow,
  spanLabel,
  toDayKey,
  toPeriodToken,
  triggerLabel,
  utcDayBounds,
} from "./date-range";
import type { RangeSelection } from "./date-range";

const DAY_MS = 86_400_000;
const PRESETS = [7, 30, 90] as const;

/** A row that exists only to put its month into `availablePeriods`. */
function postOn(day: string): BiPostRow {
  return {
    client_id: "c1",
    client_name: "Client One",
    linkedin_post_id: `p-${day}`,
    post_url: null,
    post_content: null,
    post_age: null,
    estimated_post_date: day,
    impressions: 100,
    likes: null,
    comments: null,
    reposts: null,
    saves: null,
    interactions: null,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: null,
    uploaded_at: null,
  };
}

/** The dashboard's own custom window: 12 Jun – 29 Jul 2026 is 48 days inclusive. */
const CUSTOM: RangeSelection = { kind: "custom", startDay: "2026-06-12", endDay: "2026-07-29" };

/**
 * Runs `fn` with the PROCESS timezone changed, then restores it.
 *
 * ⚠️ THE WHOLE POINT OF THE UTC TESTS BELOW. Asserting UTC behaviour while the
 * test process itself runs in UTC proves nothing — every wrong implementation
 * passes. These helpers are only meaningfully tested from a zone that is NOT
 * UTC, and from zones on BOTH sides of it, because a west-of-UTC bug and an
 * east-of-UTC bug shift the day in opposite directions and a single zone can
 * hide one of them.
 */
function underTz<T>(tz: string, fn: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

/** West of UTC and far east of it — Kiritimati is UTC+14, the extreme case. */
const ZONES = ["America/New_York", "Pacific/Kiritimati"] as const;

// ── the URL codec ────────────────────────────────────────────────────────────

describe("encodeRange / decodeRange", () => {
  it("encodes each of the four token shapes", () => {
    expect(encodeRange({ kind: "preset", days: 7 })).toBe("7d");
    expect(encodeRange({ kind: "preset", days: 30 })).toBe("30d");
    expect(encodeRange({ kind: "all" })).toBe("all");
    expect(encodeRange(CUSTOM)).toBe("2026-06-12..2026-07-29");
  });

  it("encodes the REPORT's prefixed custom form when a prefix is given", () => {
    // `?period=` already carries named keys; the prefix is what keeps a custom
    // window from colliding with one (report-period.ts's string contract).
    expect(encodeRange(CUSTOM, "custom:")).toBe("custom:2026-06-12..2026-07-29");
  });

  it("round-trips all four shapes, in both dialects", () => {
    const cases: RangeSelection[] = [
      { kind: "preset", days: 7 },
      { kind: "preset", days: 30 },
      { kind: "preset", days: 90 },
      { kind: "all" },
      CUSTOM,
    ];
    for (const sel of cases) {
      expect(decodeRange(encodeRange(sel), PRESETS)).toEqual(sel);
      expect(decodeRange(encodeRange(sel, "custom:"), PRESETS, "custom:")).toEqual(sel);
    }
  });

  it("decodes only the presets it was given", () => {
    expect(decodeRange("30d", PRESETS)).toEqual({ kind: "preset", days: 30 });
    // 45 is a perfectly well-formed token and still not a preset on this surface.
    expect(decodeRange("45d", PRESETS)).toBeNull();
    expect(decodeRange("30d", [7, 90])).toBeNull();
  });

  it("decodes a single day as a one-day window, not as malformed", () => {
    expect(decodeRange("2026-07-29..2026-07-29", PRESETS)).toEqual({
      kind: "custom",
      startDay: "2026-07-29",
      endDay: "2026-07-29",
    });
  });

  it("REFUSES AN INVERTED RANGE rather than swapping the ends", () => {
    // ⚠️ Swapping would silently answer a question nobody asked. The picker
    // cannot produce this; a hand-edited URL can.
    expect(decodeRange("2026-07-29..2026-06-12", PRESETS)).toBeNull();
  });

  it("returns null — NEVER A GUESS — for every malformed token", () => {
    const malformed = [
      "",
      " ",
      "garbage",
      "0d",
      "-7d",
      "d",
      "..",
      "2026-06-12..",
      "..2026-07-29",
      "2026-06-12..2026-07-29..2026-08-01",
      "2026-6-12..2026-07-29", // unpadded month
      "2026-06-12..2026-7-29", // unpadded day
      "2026-13-01..2026-12-31", // month 13
      "2026-02-30..2026-03-01", // 30 February
      "2026-00-10..2026-01-11", // month 0
      "2026-06-00..2026-06-10", // day 0
      "2026/06/12..2026/07/29",
      "abcd-ef-gh..2026-07-29",
    ];
    for (const token of malformed) {
      expect(decodeRange(token, PRESETS), token).toBeNull();
    }
  });

  it("does not accept the prefixed form unless the prefix was configured", () => {
    // The dialect is a decision the surface makes, not something inferred from
    // the token — two spellings for one window is how two surfaces drift.
    expect(decodeRange("custom:2026-06-12..2026-07-29", PRESETS)).toBeNull();
    expect(decodeRange("2026-06-12..2026-07-29", PRESETS, "custom:")).toBeNull();
  });

  it("returns null for the report's NAMED period keys, which it does not own", () => {
    for (const key of ["2026", "2026-Q3", "2026-07"]) {
      expect(decodeRange(key, PRESETS, "custom:"), key).toBeNull();
    }
  });

  it("decodes `all` in both dialects", () => {
    expect(decodeRange("all", PRESETS)).toEqual({ kind: "all" });
    expect(decodeRange("all", PRESETS, "custom:")).toEqual({ kind: "all" });
  });
});

// ── the local-day ⇄ UTC-instant seam ─────────────────────────────────────────

describe("toDayKey", () => {
  it("names the LOCAL calendar day the user is looking at", () => {
    // ⚠️ THE TAP, NOT THE INSTANT. A calendar hands back local midnight of the
    // day that was tapped. Reading it with toISOString() would name the day
    // before it everywhere west of UTC.
    expect(toDayKey(new Date(2026, 6, 29))).toBe("2026-07-29");
    expect(toDayKey(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toDayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("names the tapped day identically in every zone", () => {
    for (const tz of ZONES) {
      // Constructed from local parts, so this IS 29 July wherever it runs.
      expect(
        underTz(tz, () => toDayKey(new Date(2026, 6, 29))),
        tz,
      ).toBe("2026-07-29");
    }
  });

  it("pads month and day to two digits", () => {
    expect(toDayKey(new Date(2026, 2, 5))).toBe("2026-03-05");
  });
});

describe("utcDayBounds", () => {
  it("spans a calendar day from 00:00:00.000Z to 23:59:59.999Z", () => {
    const { startMs, endMs } = utcDayBounds("2026-07-29");

    expect(new Date(startMs).toISOString()).toBe("2026-07-29T00:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-07-29T23:59:59.999Z");
    expect(endMs - startMs).toBe(DAY_MS - 1);
  });

  it("yields the SAME INSTANTS from a zone west of UTC and one far east of it", () => {
    // ⚠️ The assertion that a local `new Date("2026-07-29")` implementation
    // cannot pass. New York is UTC−4 in July; Kiritimati is UTC+14.
    const expected = utcDayBounds("2026-07-29");
    for (const tz of ZONES) {
      expect(
        underTz(tz, () => utcDayBounds("2026-07-29")),
        tz,
      ).toEqual(expected);
    }
    expect(expected.startMs).toBe(Date.UTC(2026, 6, 29));
  });

  it("throws on a day it cannot read, rather than returning NaN", () => {
    // A NaN bound silently matches nothing, and the screen then reports an
    // honest-looking "no posts in this window". Failing loudly is the only
    // version of this that cannot lie.
    for (const bad of ["", "2026-13-01", "2026-02-30", "2026-7-29", "not-a-day"]) {
      expect(() => utcDayBounds(bad), bad).toThrow(/day/i);
    }
  });
});

// ── the window and its baseline ──────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ A PRESET IS A RUN OF WHOLE UTC DAYS, NOT A ROLLING N × 24 HOURS.
//
// It used to be the latter — `startMs = nowMs − N × DAY_MS` — which put every
// preset boundary at the current TIME OF DAY. That is not wrong about WHICH
// posts are in the window (`estimated_post_date` is date-only, so exactly N
// days' worth still qualified), and the measurements below pin that it stays
// right. It was wrong about what the window IS: every daily bucket then ran
// noon-to-noon and straddled two calendar days, so the chart labelled each bar
// with the day BEFORE the posts inside it — a post published on the 23rd was
// drawn under "22 Jul", and today's posts under yesterday's date.
//
// Snapping the boundary to 00:00 UTC makes a preset the same KIND of object as
// a custom range (which has always been whole days, via `utcDayBounds`), so
// there is one definition of a window rather than two that mostly agree.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveWindow — presets", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");
  /** 00:00 UTC on the day `now` falls in. */
  const todayStart = Date.UTC(2026, 6, 29);

  it("runs whole UTC days: from midnight N−1 days back to the end of today", () => {
    const w = resolveWindow({ kind: "preset", days: 30 }, now);

    expect(new Date(w.startMs).toISOString()).toBe("2026-06-30T00:00:00.000Z");
    expect(new Date(w.endMs).toISOString()).toBe("2026-07-29T23:59:59.999Z");
    expect(w.spanDays).toBe(30);
  });

  it("does not move when the clock does, only when the DAY does", () => {
    // The defining property of the change: any instant on 29 July resolves the
    // same window. Under the old rolling-hours rule, every page load produced a
    // slightly different one.
    const early = resolveWindow({ kind: "preset", days: 7 }, new Date("2026-07-29T00:00:01.000Z"));
    const late = resolveWindow({ kind: "preset", days: 7 }, new Date("2026-07-29T23:59:58.000Z"));

    expect(early).toEqual(late);
  });

  it("baselines against the equal-length window immediately before it", () => {
    const w = resolveWindow({ kind: "preset", days: 30 }, now);

    expect(w.priorEndMs).toBe(w.startMs); // no gap
    expect(w.priorStartMs).toBe(w.startMs - 30 * DAY_MS); // and exactly as long
  });

  it("covers exactly N whole days, and the prior window the N before those", () => {
    for (const days of PRESETS) {
      const w = resolveWindow({ kind: "preset", days }, now);

      expect(w.startMs, `${days}d`).toBe(todayStart - (days - 1) * DAY_MS);
      expect(w.endMs, `${days}d`).toBe(todayStart + DAY_MS - 1);
      expect(w.priorStartMs, `${days}d`).toBe(todayStart - (2 * days - 1) * DAY_MS);
    }
  });

  it("INCLUDES a post at 00:00 UTC on the window's oldest day", () => {
    // ⚠️ The invariant the whole snap exists to make unambiguous. It happened to
    // hold under the rolling-hours rule too — the day that got cut there was the
    // N+1th the window touched, not one of the N it meant — so this is a pin on
    // behaviour that must SURVIVE the change, not evidence that the change was
    // needed. The bucket alignment below is that evidence.
    for (const days of PRESETS) {
      const w = resolveWindow({ kind: "preset", days }, now);
      const oldestDay = todayStart - (days - 1) * DAY_MS;

      expect(oldestDay, `${days}d oldest`).toBeGreaterThanOrEqual(w.startMs);
      expect(todayStart, `${days}d today`).toBeLessThanOrEqual(w.endMs);
      // …and the day BEFORE the oldest is out, so the window is not N+1 days.
      expect(oldestDay - DAY_MS, `${days}d cutoff`).toBeLessThan(w.startMs);
    }
  });

  it("draws every daily bar under the date of the posts inside it", () => {
    // ⚠️ THE DEFECT THIS CHANGE ACTUALLY FIXES, AND THE ONE A USER COULD SEE.
    // A bucket is `widthMs` wide starting at `startMs`, and is labelled by that
    // instant. With `startMs` at midday, bucket 0 ran 22 Jul 12:00 → 23 Jul
    // 12:00 and was labelled "22 Jul" while holding the posts published on the
    // 23rd. Every bar on every preset was captioned with the previous day.
    const w = resolveWindow({ kind: "preset", days: 7 }, now);
    const plan = bucketPlan(w.spanDays);

    for (let i = 0; i < plan.count; i++) {
      const bucketStart = w.startMs + i * plan.widthMs;
      // The posts that land in this bucket are the ones dated on this day.
      const postDate = new Date(bucketStart);

      expect(bucketLabel(plan.unit, bucketStart), `bucket ${i}`).toBe(
        `${postDate.getUTCDate()} Jul`,
      );
      expect(Math.floor((bucketStart - w.startMs) / plan.widthMs), `bucket ${i}`).toBe(i);
    }
    // And the last bar is TODAY, not yesterday.
    expect(bucketLabel(plan.unit, w.startMs + (plan.count - 1) * plan.widthMs)).toBe("29 Jul");
  });

  it("resolves the same window from every zone the process might run in", () => {
    // The boundary is UTC. Read through local parts instead and a UTC+14 machine
    // would snap to tomorrow for most of its working day.
    const expected = resolveWindow({ kind: "preset", days: 7 }, now);

    for (const tz of ZONES) {
      expect(
        underTz(tz, () => resolveWindow({ kind: "preset", days: 7 }, now)),
        tz,
      ).toEqual(expected);
    }
  });
});

describe("resolveWindow — a custom window", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("counts BOTH endpoints: 12 Jun – 29 Jul 2026 is 48 days", () => {
    expect(resolveWindow(CUSTOM, now).spanDays).toBe(48);
  });

  it("runs from the first instant of the start day to the last of the end day", () => {
    const w = resolveWindow(CUSTOM, now);

    expect(new Date(w.startMs).toISOString()).toBe("2026-06-12T00:00:00.000Z");
    expect(new Date(w.endMs).toISOString()).toBe("2026-07-29T23:59:59.999Z");
  });

  it("baselines against exactly 48 days, with NO GAP AND NO OVERLAP", () => {
    const w = resolveWindow(CUSTOM, now);

    // Prior ends the instant the selected window begins — the same half-open
    // boundary analytics.ts uses (`t >= priorStart && t < currentStart`).
    expect(w.priorEndMs).toBe(w.startMs);
    expect(w.priorStartMs).toBe(w.startMs - 48 * DAY_MS);
    expect(w.priorEndMs! - w.priorStartMs!).toBe(48 * DAY_MS);
  });

  it("treats a single day as a one-day window baselined on the day before", () => {
    const w = resolveWindow({ kind: "custom", startDay: "2026-07-29", endDay: "2026-07-29" }, now);

    expect(w.spanDays).toBe(1);
    expect(w.priorStartMs).toBe(w.startMs - DAY_MS);
    expect(w.priorEndMs).toBe(w.startMs);
  });

  it("does not depend on `now` at all", () => {
    const a = resolveWindow(CUSTOM, new Date("2026-07-29T12:00:00.000Z"));
    const b = resolveWindow(CUSTOM, new Date("2030-01-01T00:00:00.000Z"));

    expect(a).toEqual(b);
  });

  it("resolves to the same instants in every zone", () => {
    const expected = resolveWindow(CUSTOM, now);
    for (const tz of ZONES) {
      expect(
        underTz(tz, () => resolveWindow(CUSTOM, now)),
        tz,
      ).toEqual(expected);
    }
  });

  it("does NOT clamp a window that runs past now — S2 rejects that at the URL", () => {
    // Pinned, not endorsed: the picker cannot produce a future end date, but a
    // hand-edited URL can. Clamping here would quietly shorten the window while
    // leaving the baseline the full length — the exact distortion blocking
    // future dates exists to prevent. The decoder that owns the fallback is the
    // honest place to refuse it.
    const w = resolveWindow({ kind: "custom", startDay: "2026-07-01", endDay: "2026-08-31" }, now);

    expect(w.endMs).toBeGreaterThan(now.getTime());
    expect(w.spanDays).toBe(62);
  });
});

describe("resolveWindow — all time", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("HAS NO COMPARABLE PRIOR WINDOW, and says so with null", () => {
    // ⚠️ NOT ZERO AND NOT A SENTINEL DATE. Downstream this makes the delta chip
    // ABSENT; 0 would make it render "vs. prior 0" and an epoch date would make
    // it render a comparison against 1970.
    const w = resolveWindow({ kind: "all" }, now);

    expect(w.priorStartMs).toBeNull();
    expect(w.priorEndMs).toBeNull();
    expect(w.priorStartMs).not.toBe(0);
    expect(w.priorEndMs).not.toBe(0);
  });

  it("is unbounded below rather than starting at the epoch", () => {
    const w = resolveWindow({ kind: "all" }, now);

    expect(w.startMs).toBe(Number.NEGATIVE_INFINITY);
    expect(w.endMs).toBe(now.getTime());
    expect(w.spanDays).toBe(Number.POSITIVE_INFINITY);
  });
});

// ── bucketing ────────────────────────────────────────────────────────────────

describe("bucketPlan", () => {
  it("names its two thresholds", () => {
    expect(DAILY_MAX_DAYS).toBe(14);
    expect(WEEKLY_MAX_DAYS).toBe(120);
  });

  it.each([
    [1, "day"],
    [7, "day"],
    [13, "day"],
    [14, "day"], // inclusive upper bound
    [15, "week"], // one day past it
    [30, "week"],
    [90, "week"],
    [120, "week"], // inclusive upper bound
    [121, "month"], // one day past it
    [400, "month"],
  ] as const)("buckets a %i-day span by %s", (spanDays, unit) => {
    expect(bucketPlan(spanDays).unit).toBe(unit);
  });

  it("carries the width of its unit", () => {
    expect(bucketPlan(7).widthMs).toBe(DAY_MS);
    expect(bucketPlan(30).widthMs).toBe(7 * DAY_MS);
    expect(bucketPlan(400).widthMs).toBe(30 * DAY_MS);
  });

  it.each([
    [1, 1],
    [14, 14],
    [15, 3],
    [90, 13],
    [120, 18],
    [121, 5],
    [400, 14],
  ])("covers a %i-day span with %i buckets", (spanDays, count) => {
    // Ceil, never floor: a partial trailing bucket holds real posts, and
    // dropping it would silently delete them from the chart.
    expect(bucketPlan(spanDays).count).toBe(count);
  });

  it("refuses a span it cannot draw", () => {
    // ⚠️ THE ALL-TIME TRAP. resolveWindow reports an all-time span as Infinity,
    // which is the honest answer and an impossible bucket count. The caller must
    // measure the span the DATA actually covers first.
    expect(() => bucketPlan(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
    expect(() => bucketPlan(0)).toThrow(/span/i);
    expect(() => bucketPlan(-5)).toThrow(/span/i);
    expect(() => bucketPlan(Number.NaN)).toThrow(/finite/i);
  });
});

describe("bucketLabel", () => {
  it("labels a day and a week by the day they start", () => {
    expect(bucketLabel("day", Date.UTC(2026, 6, 29))).toBe("29 Jul");
    expect(bucketLabel("week", Date.UTC(2026, 5, 12))).toBe("12 Jun");
  });

  it("CARRIES THE YEAR on a month label", () => {
    // Month buckets only appear past 120 days, which is a span long enough to
    // cross New Year — a bare "Jan" would then name two different months.
    expect(bucketLabel("month", Date.UTC(2026, 6, 1))).toBe("Jul 2026");
    expect(bucketLabel("month", Date.UTC(2025, 11, 1))).toBe("Dec 2025");
  });

  it("reads the instant in UTC from any zone", () => {
    // Midnight UTC on the 1st is still the previous month in New York.
    for (const tz of ZONES) {
      expect(
        underTz(tz, () => bucketLabel("day", Date.UTC(2026, 6, 1))),
        tz,
      ).toBe("1 Jul");
      expect(
        underTz(tz, () => bucketLabel("month", Date.UTC(2026, 6, 1))),
        tz,
      ).toBe("Jul 2026");
    }
  });
});

// ── the two labels ───────────────────────────────────────────────────────────

describe("spanLabel", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("names a preset span", () => {
    expect(spanLabel({ kind: "preset", days: 30 }, now)).toBe("30 days");
    expect(spanLabel({ kind: "preset", days: 7 }, now)).toBe("7 days");
  });

  it("names a custom span by the days it actually covers", () => {
    expect(spanLabel(CUSTOM, now)).toBe("48 days");
  });

  it("says `all time` rather than a count", () => {
    expect(spanLabel({ kind: "all" }, now)).toBe("all time");
  });

  it("does not say `1 days`", () => {
    expect(spanLabel({ kind: "custom", startDay: "2026-07-29", endDay: "2026-07-29" }, now)).toBe(
      "1 day",
    );
  });
});

describe("triggerLabel", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("names a preset and all-time", () => {
    expect(triggerLabel({ kind: "preset", days: 30 }, now)).toBe("LAST 30 DAYS");
    expect(triggerLabel({ kind: "preset", days: 7 }, now)).toBe("LAST 7 DAYS");
    expect(triggerLabel({ kind: "all" }, now)).toBe("ALL TIME");
  });

  it("prints a custom window as `12 JUN – 29 JUL 2026`", () => {
    expect(triggerLabel(CUSTOM, now)).toBe("12 JUN – 29 JUL 2026");
  });

  it("repeats the year when the window CROSSES one", () => {
    expect(
      triggerLabel({ kind: "custom", startDay: "2025-12-30", endDay: "2026-01-05" }, now),
    ).toBe("30 DEC 2025 – 5 JAN 2026");
  });

  it("prints a single day once, not as a range against itself", () => {
    expect(
      triggerLabel({ kind: "custom", startDay: "2026-07-29", endDay: "2026-07-29" }, now),
    ).toBe("29 JUL 2026");
  });

  it("reads the same in every zone", () => {
    for (const tz of ZONES) {
      expect(
        underTz(tz, () => triggerLabel(CUSTOM, now)),
        tz,
      ).toBe("12 JUN – 29 JUL 2026");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DRILL-THROUGH: the dashboard's `?range=` window, in the posts screen's
// `?period=` dialect.
//
// ⚠️ THESE TESTS ROUND-TRIP; THEY DO NOT MATCH STRINGS. Asserting that a token
// starts with "custom:" proves nothing about where the reader lands, because
// `parseReportPeriod` does not throw on a token it cannot read — it falls back
// to the NEWEST MONTH. A wrong translation therefore produces a perfectly
// plausible table of the wrong posts, and a string assertion would pass while it
// happened. Every test below feeds the produced token through the real
// `parseReportPeriod` and compares the window it actually resolves to.
//
// ⚠️ THE END BOUND IS NOT THE SAME KIND ON BOTH SIDES. `resolveWindow.endMs` is
// INCLUSIVE — the last instant of the end day, 23:59:59.999Z. `periodRange`
// returns a HALF-OPEN `end`, which every consumer filters as `ms < end`. The
// conversion is `+ 1`, landing exactly on the next day's midnight. Assert them
// equal without it and the drill-through silently drops its last day.
// ─────────────────────────────────────────────────────────────────────────────

describe("toPeriodToken — the dashboard window, spoken in the posts screen's dialect", () => {
  const NOW = new Date("2026-07-29T09:41:00.000Z");

  /** A realistic period list: exactly what the posts screen builds from its rows. */
  const AVAILABLE = availablePeriods(
    ["2026-07-20", "2026-06-15", "2026-05-02", "2025-12-31"].map(postOn),
  );

  /** Follow a dashboard selection all the way to the window the posts screen shows. */
  function drillThrough(sel: RangeSelection) {
    const token = toPeriodToken(sel, NOW, CUSTOM_PREFIX);
    const period = parseReportPeriod(token, AVAILABLE);
    return { token, period, bounds: periodRange(period) };
  }

  /** Every window the dashboard can be showing. */
  const SELECTIONS: RangeSelection[] = [
    { kind: "preset", days: 7 },
    { kind: "preset", days: 30 },
    { kind: "preset", days: 90 },
    CUSTOM,
  ];

  it("lands each preset on EXACTLY the window the dashboard resolved", () => {
    for (const sel of SELECTIONS) {
      const want = resolveWindow(sel, NOW);
      const { bounds, token } = drillThrough(sel);

      expect(bounds.start, token).toBe(want.startMs);
      // Inclusive → half-open. The `+ 1` is the last day of the window.
      expect(bounds.end, token).toBe(want.endMs + 1);
    }
  });

  it("keeps all-time as all-time, by KEY MATCH rather than by translation", () => {
    // `availablePeriods` always emits `{kind:"all", key:"all"}` first, so the
    // bare token "all" matches a real period and never reaches the fallback.
    const { token, period, bounds } = drillThrough({ kind: "all" });

    expect(token).toBe("all");
    expect(period.kind).toBe("all");
    expect(bounds.start).toBe(resolveWindow({ kind: "all" }, NOW).startMs);
    // ⚠️ THE ONE BOUND THAT IS DELIBERATELY NOT `endMs + 1`. The dashboard closes
    // all-time at `now` (no post can carry a later timestamp); the posts screen
    // leaves it unbounded. Both select the same rows — see the FLAG in the report
    // for the future-dated-row edge this leaves open.
    expect(bounds.end).toBe(Number.POSITIVE_INFINITY);
  });

  // ── the failure this slice exists to prevent ────────────────────────────────
  it("NEVER lands on a month period — the silent fallback is the whole hazard", () => {
    for (const sel of [...SELECTIONS, { kind: "all" } as RangeSelection]) {
      const { period, token } = drillThrough(sel);
      expect(period.kind, `${token} fell back to a month`).not.toBe("month");
    }
  });

  it("keeps the two dialects distinct — the dashboard cannot read its own output", () => {
    // One window, one URL per surface. If the dashboard's decoder accepted these
    // tokens too, the same window would have two spellings on the same screen.
    for (const sel of SELECTIONS) {
      const { token } = drillThrough(sel);
      if (token === "all") continue;
      expect(decodeRange(token, [...PRESETS]), token).toBeNull();
    }
  });

  it("derives its days from the RESOLVED window, not from its own arithmetic", () => {
    // A preset is a run of whole UTC days ending TODAY, so the token names those
    // exact days. Recomputing "N days back" anywhere else is how the two screens
    // drift apart; this pins the days to `resolveWindow`'s answer.
    const { startMs, endMs } = resolveWindow({ kind: "preset", days: 7 }, NOW);
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

    expect(toPeriodToken({ kind: "preset", days: 7 }, NOW, CUSTOM_PREFIX)).toBe(
      `custom:${day(startMs)}..${day(endMs)}`,
    );
  });

  it("records the exact token for each window — a readable pin, not the proof", () => {
    // The proof is the round-trip above. This is here so a reader can see what
    // actually travels in the URL without running the suite.
    expect(SELECTIONS.map((sel) => toPeriodToken(sel, NOW, CUSTOM_PREFIX))).toEqual([
      "custom:2026-07-23..2026-07-29",
      "custom:2026-06-30..2026-07-29",
      "custom:2026-05-01..2026-07-29",
      "custom:2026-06-12..2026-07-29",
    ]);
  });

  it("defaults to the bare dialect, like `encodeRange`", () => {
    expect(toPeriodToken(CUSTOM, NOW)).toBe("2026-06-12..2026-07-29");
  });
});
