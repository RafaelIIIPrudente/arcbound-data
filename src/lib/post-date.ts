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
  // ⚠️ BARE "m" IS READ AS MINUTES. LinkedIn has used it for both minutes and
  // months and no sample in this repo contains it, so it is genuinely ambiguous.
  // Reading it as minutes costs a disclosed undated row; reading it as months
  // would silently date a minutes-old post. We take the disclosed loss.
  m: "undatable",
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
 * Naive `setUTCMonth(m - n)` rolls FORWARD when the target month is too short:
 * 31 March minus one month becomes 3 March, which is both wrong and later than
 * where it started. Clamping to the last day of the target month is the honest
 * reading of "one month before the 31st".
 */
function subtractMonths(date: Date, months: number): void {
  const dayOfMonth = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() - months);
  if (date.getUTCDate() !== dayOfMonth) date.setUTCDate(0);
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
      subtractMonths(base, amount);
      break;
    case "year":
      subtractMonths(base, amount * 12);
      break;
  }

  return base.toISOString();
}
