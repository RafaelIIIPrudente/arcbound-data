// ─────────────────────────────────────────────────────────────────────────────
// READ-TIME canonicalisation for the Outreach System's dirty source
// vocabularies (ADR 0012).
//
// ⚠️ THIS MODULE READS. IT NEVER WRITES. Values reach the database exactly as
// the export sent them (ADR 0009) and stay that way forever; everything here
// decides only how a stored value is GROUPED on a chart. That separation is what
// lets the grouping be revised later without re-ingesting anything — and it is
// why nothing below is allowed to leak back into the ingest path.
//
// ⚠️ THE THREE RULES THE SOURCE FORCES, all learned from the real 1,435-row file:
//   1. Anything not in the vocabulary is DISCLOSED, never bucketed away, and
//      never GUESSED AT. The reply side answers `unrecognised` and hands the raw
//      string back; the stage side keeps the unknown stage under its own name
//      and reports its unfamiliarity separately (`isKnownStage`). Two observed
//      reply values — "Replied - Interested" and "Not Interested" — are
//      deliberately left unmapped for this reason; see REPLY_BY_KEY.
//   2. A MISSING value is its own answer, never the commonest one. "No Reply" is
//      a fact recorded on 1,396 rows; a blank cell is nobody writing anything
//      down. They must not share a bucket.
//   3. CANONICAL MEANS SPELLING, NOT GROUPING. Case and hyphen spacing are
//      normalised. Distinct states are not merged — the three `Closed - *`
//      stages stay three stages.
//
// Dependency-free on purpose (no zod, no papaparse): the client components that
// render breakdowns import it, and it must not drag the parser into the browser
// bundle. This mirrors why @/lib/post-format exists.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a Reply Status is grouped for display.
 *
 * ⚠️ `unrecognised` AND `not-recorded` ARE DIFFERENT FAILURES and must stay
 * apart. `unrecognised` means somebody wrote something this app has not been
 * taught to read — it needs surfacing verbatim so a human can decide.
 * `not-recorded` means the cell was blank; there is nothing to surface and
 * nothing to fix. Collapsing either into `no-reply` would quietly grow the
 * largest bucket on the chart with rows that never earned it.
 */
export type ReplyBucket =
  | "no-reply"
  | "positive"
  | "neutral"
  | "negative"
  | "replied-unspecified"
  | "unrecognised"
  | "not-recorded";

/** Display labels, one per bucket. Descriptive only — no scores, no grades. */
export const REPLY_BUCKET_LABELS: Record<ReplyBucket, string> = {
  "no-reply": "No reply",
  positive: "Positive reply",
  neutral: "Neutral reply",
  negative: "Negative reply",
  "replied-unspecified": "Replied, sentiment not stated",
  unrecognised: "Status not recognised",
  "not-recorded": "No status recorded",
};

/**
 * The ten Stage values observed in the source, in the order the pipeline implies.
 *
 * ⚠️ AN ORDER FOR DISPLAY, NOT A RANKING. Later in this list is not "better";
 * `Passed` and the three `Closed - *` values are simply where a prospect stopped.
 * Nothing here scores, grades or benchmarks a Client (ADR 0012).
 *
 * ⚠️ `Connected` HERE IS THE STAGE, NOT THE CONNECTION STATUS FLAG. They share a
 * word and mean different things: Stage is the furthest point reached, Connection
 * Status is a binary accepted/pending flag, and 217 accepted ≈ 177 still at
 * Connected + 40 further along. This module canonicalises the two columns
 * separately and never reconciles them.
 */
export const OUTREACH_STAGES = [
  "Requested",
  "Connected",
  "Replied",
  "In Conversation",
  "Meeting Booked",
  "Client",
  "Passed",
  "Closed - Low Fit",
  "Closed - Disqualified",
  "Closed - Rejected",
] as const;

/**
 * A comparison key that forgives FORMATTING and nothing else.
 *
 * Case, surrounding whitespace, runs of internal whitespace, and spaces around a
 * hyphen all stop mattering — so `Replied-Positive`, `Replied - Positive` and
 * `REPLIED  -  POSITIVE` meet here. The key is used for LOOKUP ONLY and is never
 * returned to a caller or stored: what comes back is always either a canonical
 * spelling this module owns or the caller's own value.
 */
function matchKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");
}

/**
 * A date somebody typed into the Reply Status field, matched at the END only.
 *
 * ⚠️ TRAILING, AND ISO-SHAPED, DELIBERATELY. Every one of the eight affected
 * rows looks like `Replied 2026-07-13`. A looser pattern would start eating
 * digits out of statuses nobody has written yet, and the cost of being too
 * strict is merely that an odd value reaches `unrecognised` and gets disclosed —
 * which is the outcome this module is built to prefer.
 */
const TRAILING_ISO_DATE = /\s+(\d{4}-\d{2}-\d{2})\s*$/;

/**
 * Reply Status match key → bucket.
 *
 * ⚠️ AN ALLOW-LIST OF VALUES SOMEBODY HAS ACTUALLY READ, NOT A BEST-EFFORT
 * CLASSIFIER. Two observed values are deliberately ABSENT and therefore reach
 * `unrecognised`:
 *
 *   • `Replied - Interested` (2 rows). "Interested" is not one of the three
 *     sentiment words this source uses — the trio is Positive / Neutral /
 *     Negative. It plausibly means positive. Plausible is not observed.
 *   • `Not Interested` (1 row). It does not even begin with "Replied", so
 *     filing it under `negative` would assert two separate things — that
 *     somebody answered, AND that the answer was bad — on one row of evidence.
 *
 * Three rows out of 1,435 is exactly the scale at which a wrong guess is
 * invisible: nobody auditing this funnel would notice three rows filed under a
 * sentiment nobody recorded. So they are printed verbatim in the disclosure
 * block and a human decides. If Arcbound tells us what they mean, they get a
 * line here — and not before.
 */
const REPLY_BY_KEY: Record<string, ReplyBucket> = {
  "no reply": "no-reply",
  "replied-positive": "positive",
  "replied-neutral": "neutral",
  "replied-negative": "negative",
  // ⚠️ A BARE "Replied" IS NOT A POSITIVE ONE. Somebody answered and nobody
  // wrote down how it went; inventing a sentiment would conjure good news out of
  // an absence. `replied-unspecified` says precisely what is known — which is
  // more than `unrecognised` says, because "Replied" IS in the vocabulary.
  replied: "replied-unspecified",
};

/** Canonical stage match key → canonical spelling. */
const STAGE_BY_KEY: Record<string, string> = Object.fromEntries(
  OUTREACH_STAGES.map((stage) => [matchKey(stage), stage]),
);

/**
 * The date a reply was recorded, when one was typed into the Reply Status.
 *
 * ⚠️ THIS IS THE ONLY REPLY DATE THAT EXISTS IN THE SOURCE. ADR 0012 records
 * that the file carries no `Date Replied` column — which is the whole reason
 * movement has to be derived by comparing snapshots. On eight rows a human typed
 * the date into the status field by hand, so stripping it for bucketing and then
 * discarding it would destroy the one place that evidence lives.
 *
 * ⚠️ RETURNS THE MATCHED TEXT VERBATIM AND DOES NOT VALIDATE IT AS A CALENDAR
 * DATE. `2026-13-45` comes back as `"2026-13-45"`. Whoever builds a timeline
 * decides what an impossible date means; silently correcting or dropping it here
 * would hide a data-quality fact from the only person who could act on it.
 */
export function replyDate(raw: string | null): string | null {
  if (raw === null) return null;
  return TRAILING_ISO_DATE.exec(raw)?.[1] ?? null;
}

/**
 * Group one Reply Status for display.
 *
 * ⚠️ ACCEPTS `null` BECAUSE THE COLUMN IS NULLABLE, AND ANSWERS `not-recorded`.
 * If this took only `string`, every caller would have to invent its own handling
 * for the blank case, and the cheap wrong answer — treating it as `no-reply` —
 * is the one that silently inflates the largest bucket on the chart. Owning the
 * null here means the rule is written once and tested once.
 *
 * ⚠️ MATCHES WHOLE VALUES, NEVER SUBSTRINGS. "Not Replied Yet" contains
 * "Replied"; a substring match would move that row from the no-reply end of the
 * funnel to the replied end on the strength of a coincidence. Unknown values go
 * to `unrecognised`, and the caller — which still holds the raw string — is
 * expected to disclose them verbatim.
 */
export function canonicalReply(raw: string | null): ReplyBucket {
  if (raw === null || raw.trim() === "") return "not-recorded";

  // Strip a hand-typed trailing date first: the date is not part of the status,
  // and `replyDate` keeps it. A dated sentiment still buckets by its sentiment.
  const withoutDate = raw.replace(TRAILING_ISO_DATE, "");
  return REPLY_BY_KEY[matchKey(withoutDate)] ?? "unrecognised";
}

/**
 * Canonicalise one Stage for display.
 *
 * ⚠️ SPELLING ONLY. Case and hyphen spacing are normalised to the canonical
 * form; DISTINCT STATES ARE NEVER MERGED. Rolling `Closed - Low Fit`,
 * `Closed - Disqualified` and `Closed - Rejected` into one "Closed" would erase
 * why four prospects ended — silent bucketing of exactly the kind ADR 0012 rules
 * out. Anyone wanting a combined figure must combine it in the open, where a
 * reader can see it happen.
 *
 * ⚠️ AN UNKNOWN STAGE COMES BACK UNDER ITS OWN NAME — IT IS NOT REPLACED BY THE
 * WORD "unrecognised". That alternative is tempting because the reply side has
 * an `unrecognised` bucket, but the two columns need opposite treatment: a reply
 * bucket is a GROUPING (many raw values, few sentiments), whereas a stage label
 * IS the value. Collapsing unknown stages to a single "unrecognised" string
 * would merge "Nurturing" and "Warm Lead" into one bar with their counts added
 * together — the silent bucketing-away this module exists to prevent, and the
 * exact opposite of disclosing them.
 *
 * Unknown-ness travels beside the value instead, via {@link isKnownStage}, so a
 * caller can both chart every stage under its own name AND list the unfamiliar
 * ones verbatim.
 */
export function canonicalStage(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  return STAGE_BY_KEY[matchKey(raw)] ?? raw.trim();
}

/**
 * Is this one of the stages the source is known to use?
 *
 * The signal behind the disclosure list: `false` means nobody has taught ArcBase
 * what this stage is, so it must be shown verbatim rather than quietly charted
 * as if understood.
 *
 * ⚠️ `false` FOR A MISSING STAGE TOO, and that is not the same fact. A blank is
 * not an unfamiliar value — there is no string to show, and an empty label names
 * nothing on screen. Callers building a verbatim disclosure list must therefore
 * filter on the LABEL being non-null as well, which `outreach-analytics` does.
 */
export function isKnownStage(raw: string | null): boolean {
  if (raw === null || raw.trim() === "") return false;
  return STAGE_BY_KEY[matchKey(raw)] !== undefined;
}

/**
 * Read a `Follow-up Count` cell as a number.
 *
 * ⚠️ THE COLUMN IS TEXT ON PURPOSE (ADR 0009) AND THIS IS ITS ONLY INTERPRETER.
 * Values are stored exactly as exported; deciding what they mean is read-time
 * work, and it lives here rather than in the parser so a wrong reading can be
 * changed without re-ingesting a single snapshot.
 *
 * ⚠️ UNREADABLE RETURNS `null` — NEVER `0`, NEVER `NaN`. `0` is the commonest
 * real value in this column (1,320 of 1,435 rows), so returning it for
 * unreadable text would hide the failure inside the largest bucket. `NaN` is
 * worse: it propagates silently through arithmetic and surfaces as a blank cell
 * nobody can trace back to a source value. `null` is the one answer a caller
 * cannot mistake for a measurement.
 *
 * ⚠️ IT READS, IT DOES NOT JUDGE. `"-1"` is unambiguously a number and comes
 * back as `-1`; refusing it would hide a data-quality fact behind the same
 * `null` that means "blank". Whoever displays the figure decides whether a
 * negative follow-up count is plausible. Non-integers (`"1.5"`) and
 * exponent/hex notation are refused, because a count of one and a half is not a
 * count and `Number()` would happily accept both.
 */
export function parseCount(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  // A whole number, with an optional sign, and nothing else. Deliberately
  // stricter than `Number()`, which accepts "", "1e3", "0x10" and " 12 ".
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}
