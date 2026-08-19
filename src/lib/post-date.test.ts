import { describe, expect, it } from "vitest";

import { resolvePostDate } from "./post-date";

// The scrape instant every case below is anchored to. Mid-month and mid-afternoon
// on purpose: a month subtraction from the 15th cannot accidentally pass by
// clamping, and a UTC time-of-day well away from midnight catches a resolver
// that silently truncates to a date.
const SCRAPED = "2026-07-15T15:25:39.889Z";

describe("resolvePostDate — day / week / month arithmetic", () => {
  it("subtracts whole days from the scrape instant, preserving time of day", () => {
    expect(resolvePostDate("4d", SCRAPED)).toBe("2026-07-11T15:25:39.889Z");
    expect(resolvePostDate("5d", SCRAPED)).toBe("2026-07-10T15:25:39.889Z");
  });

  it("subtracts weeks as seven days each", () => {
    expect(resolvePostDate("1w", SCRAPED)).toBe("2026-07-08T15:25:39.889Z");
    expect(resolvePostDate("3w", SCRAPED)).toBe("2026-06-24T15:25:39.889Z");
  });

  it("⚠️ snaps a month age to the FIRST of the month, scrape-month minus (N-1)", () => {
    // NOT derived — measured against the rows already in public.posts, which the
    // previous analytics layer resolved. Ages 4m/3m/2m scraped 2026-08-19 carry
    // 2026-05-01 / 2026-06-01 / 2026-07-01. Subtracting N months from the scrape
    // DAY instead would date an identical age a month earlier, so history and
    // new uploads would disagree in every month-bucketed chart.
    expect(resolvePostDate("1mo", SCRAPED)).toBe("2026-07-01T00:00:00.000Z");
    expect(resolvePostDate("2mo", SCRAPED)).toBe("2026-06-01T00:00:00.000Z");
    expect(resolvePostDate("3mo", SCRAPED)).toBe("2026-05-01T00:00:00.000Z");
  });

  it("reproduces the measured sample exactly, on its own scrape anchor", () => {
    // The three live rows the rule was read off, asserted as they were observed.
    const scraped = "2026-08-19T15:11:35.050Z";
    expect(resolvePostDate("4m", scraped)).toBe("2026-05-01T00:00:00.000Z");
    expect(resolvePostDate("3m", scraped)).toBe("2026-06-01T00:00:00.000Z");
    expect(resolvePostDate("2m", scraped)).toBe("2026-07-01T00:00:00.000Z");
  });

  it("⚠️ has no short-month hazard, because the 1st exists in every month", () => {
    // This replaces a clamping test. The old resolver kept the scrape's day of
    // month and had to clamp 31 March minus one month away from rolling forward
    // into 3 March. Snapping to the 1st makes that case unreachable rather than
    // handled — the assertion below would have been "2026-02-28T12:00:00.000Z".
    expect(resolvePostDate("1mo", "2026-03-31T12:00:00.000Z")).toBe("2026-03-01T00:00:00.000Z");
    expect(resolvePostDate("2mo", "2026-03-31T12:00:00.000Z")).toBe("2026-02-01T00:00:00.000Z");
  });

  it("⚠️ resolves years by the DAY, not by the month rule — measured", () => {
    // ⚠️ YEARS AND MONTHS GENUINELY DISAGREE, and assuming otherwise was wrong
    // once already. Measured: "1y" scraped 2026-08-17 carries 2025-08-17 — the
    // same day of the month, twelve months back, NOT snapped to the 1st.
    expect(resolvePostDate("1y", "2026-08-17T13:54:11.394Z")).toBe("2025-08-17T13:54:11.394Z");
    expect(resolvePostDate("1y", SCRAPED)).toBe("2025-07-15T15:25:39.889Z");
    // The month rule must NOT leak into the year branch.
    expect(resolvePostDate("1y", SCRAPED)).not.toBe("2025-07-01T00:00:00.000Z");
  });

  it("treats a zero age as a real measurement — the scrape instant itself", () => {
    // ⚠️ NOT null. "0d" says the post is from today, which is a fact; null says
    // we could not read the age at all. Those are different states.
    expect(resolvePostDate("0d", SCRAPED)).toBe(SCRAPED);
  });

  it("accepts the long and plural spellings of every datable unit", () => {
    expect(resolvePostDate("4 days", SCRAPED)).toBe("2026-07-11T15:25:39.889Z");
    expect(resolvePostDate("1 week ago", SCRAPED)).toBe("2026-07-08T15:25:39.889Z");
    expect(resolvePostDate("2 months", SCRAPED)).toBe("2026-06-01T00:00:00.000Z");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolvePostDate("  4D  ", SCRAPED)).toBe("2026-07-11T15:25:39.889Z");
    expect(resolvePostDate("1W", SCRAPED)).toBe("2026-07-08T15:25:39.889Z");
  });

  it("accepts a Date for the scrape instant as well as a string", () => {
    expect(resolvePostDate("4d", new Date(SCRAPED))).toBe("2026-07-11T15:25:39.889Z");
  });
});

describe("resolvePostDate — ⚠️ sub-day ages are NULL, deliberately", () => {
  // This is not a parsing failure. An hour-grained age is DATABLE in principle —
  // we simply refuse to date it, because bucketing a weekly scrape's fresh posts
  // onto the scrape day is what `impressionsByWeekday` calls fabricating a rhythm
  // in a client-facing chart. `weekdayUndatedPosts` exists to disclose exactly
  // this exclusion. Resolving these would silently invalidate a correct chart.
  it("returns null for hour ages", () => {
    expect(resolvePostDate("23h", SCRAPED)).toBeNull();
    expect(resolvePostDate("1h", SCRAPED)).toBeNull();
    expect(resolvePostDate("5 hours ago", SCRAPED)).toBeNull();
  });

  it("returns null for minute and second ages", () => {
    // ⚠️ "45m" IS DELIBERATELY ABSENT HERE. The bare token is MONTHS (see the
    // measured case below); only the spelled-out minute forms belong in this list.
    expect(resolvePostDate("45min", SCRAPED)).toBeNull();
    expect(resolvePostDate("2 minutes", SCRAPED)).toBeNull();
    expect(resolvePostDate("30s", SCRAPED)).toBeNull();
  });

  it("⚠️ reads a bare 'm' as MONTHS — measured against the live data, not assumed", () => {
    // This token was briefly read as MINUTES, on the reasoning that it is
    // ambiguous and unsampled. The live database then showed 203 "m" ages out of
    // 272 posts, against a single "h" — a posting history, not posts scraped
    // within the hour of publishing. Reading it as minutes would have nulled the
    // publish date of 75% of every future upload.
    expect(resolvePostDate("2m", SCRAPED)).toBe(resolvePostDate("2 months", SCRAPED));
    expect(resolvePostDate("2m", SCRAPED)).not.toBeNull();
  });

  it("⚠️ keeps the unambiguous minute tokens undatable — only the bare 'm' moved", () => {
    // The fix above must not drag "min"/"minutes" with it: those are genuinely
    // minute-grained, and dating them lands a fresh post on the scrape's own
    // weekday, which impressionsByWeekday calls fabricating a rhythm.
    expect(resolvePostDate("2min", SCRAPED)).toBeNull();
    expect(resolvePostDate("2mins", SCRAPED)).toBeNull();
    expect(resolvePostDate("2 minute", SCRAPED)).toBeNull();
    expect(resolvePostDate("2 minutes", SCRAPED)).toBeNull();
  });
});

describe("resolvePostDate — unreadable input is NULL, never a guess", () => {
  it("returns null for absent input", () => {
    expect(resolvePostDate(null, SCRAPED)).toBeNull();
    expect(resolvePostDate(undefined, SCRAPED)).toBeNull();
    expect(resolvePostDate("", SCRAPED)).toBeNull();
    expect(resolvePostDate("   ", SCRAPED)).toBeNull();
  });

  it("returns null for malformed ages", () => {
    expect(resolvePostDate("yesterday", SCRAPED)).toBeNull();
    expect(resolvePostDate("d4", SCRAPED)).toBeNull();
    expect(resolvePostDate("4", SCRAPED)).toBeNull();
    expect(resolvePostDate("abc", SCRAPED)).toBeNull();
    expect(resolvePostDate("-4d", SCRAPED)).toBeNull();
    expect(resolvePostDate("4.5d", SCRAPED)).toBeNull();
  });

  it("⚠️ returns null for an ABSOLUTE date — no such shape is evidenced", () => {
    // Every real sample in this repo is relative ("23h", "4d", "1w"). No
    // absolute-date scrape value has ever been observed, so no absolute branch
    // is implemented and none is invented. If the scraper starts emitting these,
    // these posts go undated and the undated count discloses it — the failure is
    // visible, not silent. FLAGGED as unresolved in the runbook.
    expect(resolvePostDate("2026-07-01", SCRAPED)).toBeNull();
    expect(resolvePostDate("July 1, 2026", SCRAPED)).toBeNull();
  });

  it("returns null when the scrape instant itself is unusable", () => {
    expect(resolvePostDate("4d", "not-a-date")).toBeNull();
    expect(resolvePostDate("4d", "")).toBeNull();
  });
});
