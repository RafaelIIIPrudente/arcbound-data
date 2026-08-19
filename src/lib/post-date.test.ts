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

  it("subtracts calendar months, not 30-day blocks", () => {
    expect(resolvePostDate("2mo", SCRAPED)).toBe("2026-05-15T15:25:39.889Z");
    // June is 30 days and July is 31; a 30-day-per-month resolver lands on the
    // 14th here and is wrong.
    expect(resolvePostDate("1mo", SCRAPED)).toBe("2026-06-15T15:25:39.889Z");
  });

  it("clamps a month subtraction that would overflow a short month", () => {
    // 31 March minus one month is not 3 March. Naive setUTCMonth rolls forward
    // into the next month; the last day of the target month is the honest answer.
    expect(resolvePostDate("1mo", "2026-03-31T12:00:00.000Z")).toBe("2026-02-28T12:00:00.000Z");
  });

  it("subtracts years", () => {
    expect(resolvePostDate("1y", SCRAPED)).toBe("2025-07-15T15:25:39.889Z");
  });

  it("treats a zero age as a real measurement — the scrape instant itself", () => {
    // ⚠️ NOT null. "0d" says the post is from today, which is a fact; null says
    // we could not read the age at all. Those are different states.
    expect(resolvePostDate("0d", SCRAPED)).toBe(SCRAPED);
  });

  it("accepts the long and plural spellings of every datable unit", () => {
    expect(resolvePostDate("4 days", SCRAPED)).toBe("2026-07-11T15:25:39.889Z");
    expect(resolvePostDate("1 week ago", SCRAPED)).toBe("2026-07-08T15:25:39.889Z");
    expect(resolvePostDate("2 months", SCRAPED)).toBe("2026-05-15T15:25:39.889Z");
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
    expect(resolvePostDate("45m", SCRAPED)).toBeNull();
    expect(resolvePostDate("45min", SCRAPED)).toBeNull();
    expect(resolvePostDate("2 minutes", SCRAPED)).toBeNull();
    expect(resolvePostDate("30s", SCRAPED)).toBeNull();
  });

  it("⚠️ reads a bare 'm' as MINUTES, so it nulls rather than dates", () => {
    // The one genuinely ambiguous token in the vocabulary: LinkedIn has used
    // bare "m" for both minutes and months. No sample in this repo contains it.
    // Nulling a month-old post loses it from dated charts and SAYS SO through
    // the undated disclosure; dating a minutes-old post fabricates a rhythm
    // silently. We take the disclosed loss. FLAGGED in the runbook.
    expect(resolvePostDate("2m", SCRAPED)).toBeNull();
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
