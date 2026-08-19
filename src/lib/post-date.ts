// ─────────────────────────────────────────────────────────────────────────────
// ArcBase's OWN relative-age resolver (ADR 0010, D5). Pure, no I/O, no clock —
// the scrape instant is always passed in, so this is fully unit-testable and
// never depends on when it runs.
//
// It replaces the resolution that `bi.linkedin_post_latest` performs today. The
// scrape does not carry a publish date; it carries an AGE relative to the moment
// it was taken ("4d", "1w", "23h"), and `scraped_at` is the anchor.
//
// ⚠️ THIS RESOLVES IN TYPESCRIPT, NOT plpgsql, AND THAT IS THE POINT. Vitest can
// exercise every branch here; a plpgsql resolver could only be checked by running
// the database. The ingest RPC therefore receives an ALREADY-RESOLVED value and
// performs no date arithmetic of its own.
//
// ⚠️ FOUR STATES, NOT TWO. A null return means "no publish date can be
// established" — it is never a zero, never today, and never the scrape day. The
// caller stores null and the reporting layer discloses the row as undated.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How each recognised unit is treated. `undatable` units are parsed
 * successfully and then deliberately refused — see the note on sub-day ages.
 */
type Unit = "undatable" | "day" | "week" | "month" | "year";

const UNITS: Readonly<Record<string, Unit>> = {
  // ⚠️ SUB-DAY AGES ARE PARSED AND THEN REFUSED, DELIBERATELY — see below.
  s: "undatable",
  sec: "undatable",
  secs: "undatable",
  second: "undatable",
  seconds: "undatable",
  // ⚠️ BARE "m" IS MONTHS, AND THIS IS MEASURED RATHER THAN ASSUMED. It was
  // briefly read as MINUTES on the reasoning that the token is ambiguous and no
  // sample in this repo contained it. The live database contained 203 of them —
  // 75% of every post on record — against 33 "w", 24 "y", 11 "d" and a single
  // "h". That is a posting history, not a burst of posts scraped within the hour.
  // Confirmed directly against the scrape anchor: "4m"/"3m"/"2m" scraped on
  // 2026-08-19 resolved to 2026-05-01 / 2026-06-01 / 2026-07-01.
  //
  // ⚠️ ONLY THE BARE TOKEN MOVED. "min"/"mins"/"minute"/"minutes" stay undatable
  // below — those are unambiguous and genuinely minute-grained.
  m: "month",
  min: "undatable",
  mins: "undatable",
  minute: "undatable",
  minutes: "undatable",
  h: "undatable",
  hr: "undatable",
  hrs: "undatable",
  hour: "undatable",
  hours: "undatable",

  d: "day",
  day: "day",
  days: "day",

  w: "week",
  wk: "week",
  wks: "week",
  week: "week",
  weeks: "week",

  mo: "month",
  mos: "month",
  mon: "month",
  month: "month",
  months: "month",

  y: "year",
  yr: "year",
  yrs: "year",
  year: "year",
  years: "year",
};

/**
 * Subtract whole calendar months in place, clamping rather than overflowing.
 *
 * ⚠️ YEARS USE THIS; MONTHS DO NOT. The two units are resolved by DIFFERENT
 * rules in the historical data, which is measured, not assumed: "1y" scraped
 * 2026-08-17 carries 2025-08-17 — the same DAY, one year earlier — while month
 * ages snap to the first of a month (see snapToMonthStart). Do not unify them.
 *
 * Naive `setUTCMonth(m - n)` rolls FORWARD when the target month is too short:
 * 29 February minus twelve months would become 1 March. Clamping to the last day
 * of the target month is the honest reading.
 */
function subtractMonths(date: Date, months: number): void {
  const dayOfMonth = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() - months);
  if (date.getUTCDate() !== dayOfMonth) date.setUTCDate(0);
}

/**
 * Snap a month-grained age to the FIRST of a month, `monthsBack` months before
 * the scrape's own month, at midnight UTC.
 *
 * ⚠️ THIS MATCHES THE HISTORICAL DATA RATHER THAN BEING DERIVED. Measured
 * against real rows: ages "4m"/"3m"/"2m" scraped on 2026-08-19 carry
 * 2026-05-01 / 2026-06-01 / 2026-07-01 — the first of the month, and the month
 * is the scrape's own month minus (N − 1), not minus N.
 *
 * ⚠️ EVERY POST ALREADY IN `public.posts` CARRIES THIS CONVENTION, which is the
 * whole reason to reproduce it. Those rows were loaded from the previous
 * analytics layer; a resolver that subtracted N months from the scrape day
 * instead would date an identical age a MONTH EARLIER and on a different day,
 * so a month-bucketed chart would silently mix two conventions depending on
 * when each row happened to be loaded.
 *
 * ⚠️ IT CARRIES A KNOWN FORWARD BIAS, AND THAT IS ACCEPTED DELIBERATELY. A post
 * "4 months old" on 19 August was published around 19 April; this returns
 * 1 May — systematically later than the post can actually be. Consistency with
 * every existing row was chosen over accuracy against an unknowable true day.
 * Do not "fix" this in isolation: it would have to be a backfill of the whole
 * table, not a change here.
 *
 * Snapping to the 1st also makes the short-month hazard unreachable — the 1st
 * exists in every month, so there is nothing to clamp.
 */
function snapToMonthStart(date: Date, monthsBack: number): void {
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
}

/**
 * Resolve a scraped relative age to an estimated publish instant.
 *
 * @param postAge  The scrape's raw age text, e.g. `"4d"`, `"1w"`, `"23h"`.
 * @param scrapedAt The instant the scrape was taken — the anchor.
 * @returns An ISO-8601 instant, or **null** when no date can be established.
 *
 * ⚠️ HOUR- AND MINUTE-GRAINED AGES RESOLVE TO NULL ON PURPOSE, and this is
 * load-bearing rather than a limitation. A weekly scrape's freshest posts all
 * carry hour ages; dating them lands every one of them on the scrape's own
 * weekday, which `impressionsByWeekday` describes as fabricating a rhythm in a
 * client-facing chart. `weekdayUndatedPosts` exists to disclose the exclusion.
 * Resolving these would silently invalidate a chart that is currently correct.
 *
 * ⚠️ NO ABSOLUTE-DATE BRANCH EXISTS, because no absolute-date sample exists.
 * Every observed value in this repo is relative. An unrecognised shape returns
 * null and is disclosed as undated — a visible gap, never an invented date.
 */
export function resolvePostDate(
  postAge: string | null | undefined,
  scrapedAt: string | Date,
): string | null {
  if (typeof postAge !== "string") return null;

  const normalised = postAge
    .trim()
    .toLowerCase()
    .replace(/\s+ago$/, "")
    .trim();
  if (normalised === "") return null;

  // Whole non-negative count, then a unit word. A decimal ("4.5d"), a sign
  // ("-4d"), a bare number ("4") and a reversed token ("d4") all fail here.
  const match = /^(\d+)\s*([a-z]+)$/.exec(normalised);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = UNITS[match[2] as string];
  if (unit === undefined || !Number.isFinite(amount)) return null;
  if (unit === "undatable") return null;

  const base = scrapedAt instanceof Date ? new Date(scrapedAt.getTime()) : new Date(scrapedAt);
  if (Number.isNaN(base.getTime())) return null;

  switch (unit) {
    case "day":
      base.setUTCDate(base.getUTCDate() - amount);
      break;
    case "week":
      base.setUTCDate(base.getUTCDate() - amount * 7);
      break;
    case "month":
      // (amount − 1): measured, see snapToMonthStart.
      snapToMonthStart(base, amount - 1);
      break;
    case "year":
      // ⚠️ MEASURED, AND DELIBERATELY NOT THE MONTH RULE. "1y" scraped
      // 2026-08-17 carries 2025-08-17 in the historical data: the same day of
      // the month, twelve months back, NOT snapped to the 1st and with no
      // (N − 1) offset. Years and months genuinely disagree here; an earlier
      // pass assumed they matched and was wrong.
      subtractMonths(base, amount * 12);
      break;
  }

  return base.toISOString();
}
