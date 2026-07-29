// ─────────────────────────────────────────────────────────────────────────────
// THE DATE RANGE, AND EVERYTHING DERIVED FROM IT.
//
// Pure, dependency-free and deterministic: `now` is always injected, never read
// from the clock, matching how `buildDashboardAnalytics(rows, { range, now })`
// already takes its own. Nothing here imports React — the dashboard, the report
// and their tests all resolve a window through this one module so the two
// surfaces cannot come to disagree about what "the window" means.
//
// ⚠️ TWO KINDS OF DATE LIVE HERE AND MUST NOT BE CONFUSED.
//
//   A DAY  — "2026-07-29", the square a user tapped. It has no time and no zone.
//   AN INSTANT — a millisecond number, which is a fixed point on the world clock.
//
// A day becomes instants in exactly one place, `utcDayBounds`, and always in
// UTC, because that is what the windowing code already does (`getUTCDay`,
// `.toISOString().slice(0, 10)`). A Date object handed back by a calendar is the
// other direction and reads its LOCAL parts — see `toDayKey`. Cross those two
// over and every window silently shifts by a day for most of the world.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What the user has chosen. A preset carries its LENGTH rather than a label, so
 * the window arithmetic never branches on the literal strings "7d" / "90d" the
 * way `bucketLabel` used to.
 */
export type RangeSelection =
  | { kind: "preset"; days: number }
  | { kind: "all" }
  | { kind: "custom"; startDay: string; endDay: string };

/** The bucket widths a series can be drawn at. */
export type BucketUnit = "day" | "week" | "month";

export interface ResolvedWindow {
  /** First instant of the window, INCLUSIVE. `-Infinity` for all time. */
  startMs: number;
  /** Last instant of the window, INCLUSIVE — 23:59:59.999Z of the end day. */
  endMs: number;
  /** Calendar days covered, counting BOTH endpoints. `Infinity` for all time. */
  spanDays: number;
  /**
   * The baseline window: equally long, ending where this one starts.
   *
   * ⚠️ NULL FOR ALL TIME, WHICH IS NOT ZERO AND NOT A SENTINEL DATE. All time
   * has no comparable prior window at all, and downstream that must make the
   * ▲/▼ chip ABSENT — this repo reserves the em dash for "could not compute",
   * which is a different statement.
   */
  priorStartMs: number | null;
  /** EXCLUSIVE, unlike `endMs` — it is the instant `startMs`, not the ms before it. */
  priorEndMs: number | null;
}

export interface BucketPlan {
  unit: BucketUnit;
  widthMs: number;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ FLAGGED CONSTANTS — INVENTED CUTOFFS, PERMITTED ONLY BECAUSE OF WHAT THEY
// GOVERN.
//
// 14 and 120 are not derived from anything. They are allowed here, and nowhere
// else in this codebase, because they decide HOW BARS ARE DRAWN — a readability
// boundary — and assert nothing whatsoever about the data. Ninety days of posts
// drawn daily is 90 unreadable slivers; the same posts drawn weekly is the same
// data, legible. No claim is made that 14 days is "short" or that 121 days is
// "long".
//
// The distinction matters because this repo has BANNED the other kind: a
// "short / medium / long post" tertile was rejected outright, because cutting
// data at an invented number and then naming the buckets asserts a finding
// nobody measured. If a future reader is tempted to reuse these two numbers to
// classify anything, that is the line they would be crossing.
// ─────────────────────────────────────────────────────────────────────────────

/** Spans up to and including this many days are drawn one bar per day. */
export const DAILY_MAX_DAYS = 14;
/** Spans up to and including this many days are drawn one bar per week. */
export const WEEKLY_MAX_DAYS = 120;

// ── days ─────────────────────────────────────────────────────────────────────

/** Strict: `2026-7-29` is rejected rather than repaired. */
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** First instant of a day in UTC, or null if the string is not a real calendar day. */
function parseDayStart(day: string): number | null {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const date = Number(m[3]);
  const ms = Date.UTC(year, month - 1, date);
  // Date.UTC rolls over silently: month 13 becomes January, 30 February becomes
  // 2 March. Reading the result back is what catches a day that does not exist.
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== date
  ) {
    return null;
  }
  return ms;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The day a `Date` from a calendar represents, as `YYYY-MM-DD`.
 *
 * ⚠️ READS LOCAL PARTS, DELIBERATELY. A calendar hands back local midnight of
 * the square that was tapped, so `toISOString().slice(0, 10)` would name the day
 * BEFORE it everywhere west of UTC — a New York user tapping 29 July would
 * filter on 28 July and never find out. This function is the only place a Date
 * is turned back into a day, and `utcDayBounds` is the only place a day is
 * turned into instants.
 */
export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The instants a calendar day spans, in UTC: `00:00:00.000Z` to `23:59:59.999Z`.
 *
 * ⚠️ THROWS rather than returning NaN for a day it cannot read. A NaN bound
 * compares false against everything, so the window would quietly match no rows
 * and the screen would report a confident, wrong "no posts in this range" —
 * a fabricated genuine-zero, which is the one failure this repo will not ship.
 */
export function utcDayBounds(day: string): { startMs: number; endMs: number } {
  const startMs = parseDayStart(day);
  if (startMs === null) throw new Error(`Not a calendar day: ${JSON.stringify(day)}`);
  return { startMs, endMs: startMs + DAY_MS - 1 };
}

// ── the URL codec ────────────────────────────────────────────────────────────

/**
 * The token a selection travels as in the URL.
 *
 * `customPrefix` picks the dialect: the dashboard's `?range=` takes the bare
 * form (`2026-06-12..2026-07-29`), the report's `?period=` takes `custom:` in
 * front so a window cannot collide with a named period key.
 *
 * ⚠️ Callers must ALWAYS write the param they encode, never strip it when it
 * matches a default — `report-period.ts` documents why: an absent param
 * legitimately means "no choice yet", and stripping made a deliberate choice
 * indistinguishable from no choice, so the selection silently reverted.
 */
export function encodeRange(sel: RangeSelection, customPrefix = ""): string {
  if (sel.kind === "all") return "all";
  if (sel.kind === "preset") return `${sel.days}d`;
  return `${customPrefix}${sel.startDay}..${sel.endDay}`;
}

/**
 * The selection a URL token means, or `null` if this surface does not recognise
 * it.
 *
 * ⚠️ NULL IS AN ANSWER, NOT A FAILURE TO ANSWER — and it is never a guess. An
 * unknown preset, a malformed day, a range whose end precedes its start and the
 * report's named period keys all return null so the caller can fall back to its
 * own documented default. Swapping an inverted range, or repairing `2026-7-29`,
 * would answer a question the user did not ask.
 *
 * @param presets Day-counts this surface offers. `"45d"` is well-formed and
 *   still unrecognised if 45 is not among them.
 */
export function decodeRange(
  token: string,
  presets: readonly number[],
  customPrefix = "",
): RangeSelection | null {
  if (token === "all") return { kind: "all" };

  const preset = /^(\d+)d$/.exec(token);
  if (preset) {
    const days = Number(preset[1]);
    return presets.includes(days) ? { kind: "preset", days } : null;
  }

  // The dialect is the surface's decision, not something inferred from the
  // token: accepting both spellings would give one window two URLs.
  if (customPrefix !== "" && !token.startsWith(customPrefix)) return null;
  const body = customPrefix === "" ? token : token.slice(customPrefix.length);

  const parts = body.split("..");
  if (parts.length !== 2) return null;
  const [startDay, endDay] = parts as [string, string];
  const startMs = parseDayStart(startDay);
  const endMs = parseDayStart(endDay);
  if (startMs === null || endMs === null) return null;
  if (startMs > endMs) return null;

  return { kind: "custom", startDay, endDay };
}

// ── the window ───────────────────────────────────────────────────────────────

/**
 * The instants a selection covers, and the baseline it is measured against.
 *
 * ⚠️ THE BASELINE IS THE EQUAL-LENGTH WINDOW IMMEDIATELY BEFORE THIS ONE — a
 * 48-day range compares against the 48 days before it, with no gap and no
 * overlap. That GENERALISES the rule `analytics.ts` already applies to the three
 * presets rather than adding a second one beside it; presets and custom ranges
 * stay one concept, and `priorEndMs` is exclusive to match the half-open filter
 * (`t >= priorStart && t < currentStart`) that code already uses.
 *
 * ⚠️ A CUSTOM WINDOW ENDING IN THE FUTURE IS RESOLVED AS GIVEN, NOT CLAMPED.
 * The picker cannot produce one; a hand-edited URL can. Clamping here would
 * shorten the window while leaving the baseline its full declared length, which
 * is precisely the distortion that blocking future dates exists to prevent. The
 * decoder that owns the fallback — the surface's URL normaliser — is the honest
 * place to refuse such a token outright.
 */
export function resolveWindow(sel: RangeSelection, now: Date): ResolvedWindow {
  const nowMs = now.getTime();

  if (sel.kind === "all") {
    return {
      // Unbounded, not the epoch: 1970 is a date, and a date here would be a
      // claim about where the data starts.
      startMs: Number.NEGATIVE_INFINITY,
      endMs: nowMs,
      spanDays: Number.POSITIVE_INFINITY,
      priorStartMs: null,
      priorEndMs: null,
    };
  }

  if (sel.kind === "preset") {
    const startMs = nowMs - sel.days * DAY_MS;
    return {
      startMs,
      endMs: nowMs,
      spanDays: sel.days,
      priorStartMs: startMs - sel.days * DAY_MS,
      priorEndMs: startMs,
    };
  }

  const { startMs } = utcDayBounds(sel.startDay);
  const end = utcDayBounds(sel.endDay);
  // Both endpoints count: 12 Jun – 29 Jul is 48 days, not 47.
  const spanDays = Math.round((end.startMs - startMs) / DAY_MS) + 1;

  return {
    startMs,
    endMs: end.endMs,
    spanDays,
    priorStartMs: startMs - spanDays * DAY_MS,
    priorEndMs: startMs,
  };
}

// ── bucketing ────────────────────────────────────────────────────────────────

/**
 * How to slice a span into bars: one rule for presets and custom ranges alike.
 *
 * Month buckets are a fixed 30 days — an approximation, the same word the
 * previous `RANGE_BUCKETS` comment used. They are labelled by the month their
 * bucket STARTS in, so over a very long span a label can drift by a few days
 * from the calendar month it names.
 *
 * ⚠️ THROWS on a span that cannot be drawn, including `Infinity`. That is the
 * all-time trap: `resolveWindow` honestly reports an all-time span as Infinity,
 * and `Math.ceil(Infinity / width)` is an infinite bucket count. A caller
 * drawing all time must first measure the span the DATA actually covers.
 */
export function bucketPlan(spanDays: number): BucketPlan {
  if (!Number.isFinite(spanDays)) {
    throw new Error(`Bucket span must be a finite number of days, got ${spanDays}`);
  }
  if (spanDays <= 0) {
    throw new Error(`Bucket span must be at least one day, got ${spanDays}`);
  }

  const unit: BucketUnit =
    spanDays <= DAILY_MAX_DAYS ? "day" : spanDays <= WEEKLY_MAX_DAYS ? "week" : "month";
  const widthDays = unit === "day" ? 1 : unit === "week" ? 7 : 30;

  return {
    unit,
    widthMs: widthDays * DAY_MS,
    // Ceil, never floor: a partial trailing bucket holds real posts, and
    // dropping it would delete them from the chart without saying so.
    count: Math.ceil(spanDays / widthDays),
  };
}

/**
 * The axis tick for a bucket, from the instant it starts.
 *
 * Read in UTC, matching the windowing. Day and week buckets are named by the day
 * they open — never a weekday name, which repeats after seven bars and would
 * label two different days "Mon" on any span past a week. A month label CARRIES
 * ITS YEAR, because month buckets only appear past 120 days and a span that long
 * can cross New Year, where a bare "Jan" would name two different months.
 */
export function bucketLabel(unit: BucketUnit, startMs: number): string {
  const d = new Date(startMs);
  const month = MONTHS[d.getUTCMonth()]!;
  return unit === "month" ? `${month} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${month}`;
}

// ── labels ───────────────────────────────────────────────────────────────────

/** The span, as prose for the "vs. prior …" copy and the chart captions. */
export function spanLabel(sel: RangeSelection, now: Date): string {
  if (sel.kind === "all") return "all time";
  // Through resolveWindow rather than off `sel`, so there is one definition of
  // how long a window is and the caption cannot disagree with the chart.
  const { spanDays } = resolveWindow(sel, now);
  return spanDays === 1 ? "1 day" : `${spanDays} days`;
}

/**
 * What the picker's trigger reads. Uppercase, matching the existing mono
 * `TRIGGER` style on both surfaces.
 */
export function triggerLabel(sel: RangeSelection, now: Date): string {
  if (sel.kind === "all") return "ALL TIME";
  if (sel.kind === "preset") return `LAST ${sel.days} DAYS`;

  const { startMs, endMs } = resolveWindow(sel, now);
  const from = new Date(startMs);
  const to = new Date(endMs);
  const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.toUpperCase()}`;
  const year = (d: Date) => d.getUTCFullYear();

  // A one-day window is stated once — "29 JUL – 29 JUL 2026" reads as a range
  // against itself.
  if (startMs === utcDayBounds(sel.endDay).startMs) return `${day(to)} ${year(to)}`;
  // The year is repeated only when the window crosses one, where printing it
  // once would attach the wrong year to the opening date.
  if (year(from) !== year(to)) return `${day(from)} ${year(from)} – ${day(to)} ${year(to)}`;
  return `${day(from)} – ${day(to)} ${year(to)}`;
}
