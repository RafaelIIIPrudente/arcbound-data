import { toCanonicalFormat } from "@/lib/post-format";
import type { BiPostRow } from "@/services/analytics";
import { readAllPostRows } from "@/services/bi-posts";
import { listClientRegistry } from "@/services/clients";
import { listPostAttributes, toFormatMap } from "@/services/post-attributes";
import { listAllUploads } from "@/services/uploads";
import type {
  DataQuality,
  DataQualityRow,
  LastUpload,
  RateReconciliation,
  Upload,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Data Quality seam. Answers the one question nothing else in ArcBase answers:
// can I trust these numbers?
//
// ⚠️ EVERY FIGURE ON THIS SCREEN DERIVES FROM EXACTLY ONE READ.
//
// That is why this reads `readAllPostRows` + `listClientRegistry` rather than
// `listClients` — whose `postsCount` comes from a SECOND, independent bi read.
// Two counts of the same thing on one page will eventually disagree, and a
// data-quality screen that contradicts itself is worse than no screen at all.
//
// ⚠️ IT STATES NUMBERS, NEVER VERDICTS. Attribution happens downstream of
// ArcBase as a name match (ADR 0009), so "submitted 40, attributed 0" is all
// this seam can honestly say. A name mismatch, a client who stopped posting,
// and a downstream outage look identical from here. Do not add a `broken` flag,
// a reason, or a diagnosis — none of them are knowable at this layer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long since the last ingest before a Client counts as stale.
 *
 * Two missed weekly uploads. Named and exported rather than inlined so the
 * cadence is changeable in one place and testable without reaching for a magic
 * number in an assertion.
 */
export const STALE_AFTER_DAYS = 14;

/**
 * How far two engagement rates may differ before they count as disagreeing, in
 * PERCENTAGE POINTS (both rates are percentages).
 *
 * 0.1pp absorbs rounding and float noise while still catching a real difference
 * in definition. Named and exported so it is changeable in one place and
 * assertable without a magic number.
 */
export const RATE_TOLERANCE_PCT = 0.1;

const DAY_MS = 86_400_000;

/** The middle value, or the mean of the middle two. Sorts a COPY. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * How far the median provided/calculated ratio may stray from 1 and still count
 * as "the same scale". A unit mismatch lands near 100 or 0.01, so anything
 * inside this band is a genuine difference in the numbers rather than in units.
 */
export const RATE_SCALE_BAND = 2;

/** A finite number, or null. Absence is never coerced to 0 here. */
function finite(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Reconcile the three engagement-rate definitions across every post read.
 *
 * ⚠️ ARCBASE'S OWN PER-POST RATE IS COMPUTED HERE AND NOWHERE ELSE, AND IS NEVER
 * RENDERED. It exists solely to answer "does the view's per-post rate use the
 * same numerator and denominator our dashboard aggregate does?". Do not lift it
 * out of this function to display it — that would create the fourth competing
 * definition this slice exists to prevent.
 *
 * ⚠️ AND IT REPORTS, IT DOES NOT RESOLVE. No averaging, no picking a winner.
 */
export function reconcileRates(rows: BiPostRow[]): RateReconciliation {
  let postsMissingRate = 0;
  let rateDisagreements = 0;
  let rateComparablePosts = 0;
  let formulaCheckedPosts = 0;
  let formulaMismatches = 0;
  const ratios: number[] = [];

  for (const row of rows) {
    const calculated = finite(row.calculated_engagement_rate);
    const provided = finite(row.provided_engagement_rate);

    // A missing rate is NOT a rate of zero, and not a disagreement either.
    if (calculated === null) postsMissingRate += 1;

    if (calculated !== null && provided !== null) {
      rateComparablePosts += 1;
      if (Math.abs(provided - calculated) > RATE_TOLERANCE_PCT) rateDisagreements += 1;
      // Guard the divisor: a calculated rate of exactly 0 makes the ratio
      // meaningless (or infinite), and one such post would drag the median into
      // nonsense. Excluded from the ratio only — it still counts as comparable.
      if (calculated !== 0) ratios.push(provided / calculated);
    }

    // THE FORMULA CHECK. A post is checkable only with all three of a rate, a
    // numerator, and positive impressions — a post with no reach has no
    // defensible rate under any formula, and a post with no interactions has no
    // rate at all.
    //
    // ⚠️ ALL THREE ARE THREE-STATED, `interactions` INCLUDED. Defaulting an
    // absent numerator to 0 computes a 0% rate, disagrees with any real rate,
    // and scores a MISSING measurement as a definitional difference — in the one
    // figure here staff would act on. Nothing in this function may default an
    // absent measurement to zero.
    //
    // ⚠️ A MEASURED 0 IS STILL CHECKED. `finite(0)` is 0, not null: the post
    // genuinely earned nothing, its rate genuinely is 0%, and a non-zero column
    // genuinely disagrees. Excluding it would be the same collapse reversed.
    const impressions = finite(row.impressions);
    const interactions = finite(row.interactions);
    if (calculated !== null && interactions !== null && impressions !== null && impressions > 0) {
      formulaCheckedPosts += 1;
      // The SAME formula the dashboard aggregates, applied to one post. If this
      // matches the view's column, the aggregate and the per-post figure share a
      // numerator and a denominator — which is the thing being established.
      const arcbaseRate = (interactions / impressions) * 100;
      if (Math.abs(arcbaseRate - calculated) > RATE_TOLERANCE_PCT) formulaMismatches += 1;
    }
  }

  const rateMedianRatio = median(ratios);

  return {
    postsMissingRate,
    rateDisagreements,
    rateComparablePosts,
    rateMedianRatio,
    // Decided HERE, once, so no reader has to divide 6.23 by 0.0623 in their head
    // to work out whether a wall of "disagreements" is a real finding or a unit
    // difference. The band is symmetric in ratio space: 1/2 and 2 are equally
    // "aligned", 0.01 and 100 equally "rescaled".
    rateScale:
      rateMedianRatio === null
        ? null
        : rateMedianRatio >= 1 / RATE_SCALE_BAND && rateMedianRatio <= RATE_SCALE_BAND
          ? "aligned"
          : "rescaled",
    // ⚠️ STRICT ON PURPOSE, AND REPORTED WITH ITS DENOMINATOR. One disagreeing
    // post is a real disagreement, so no tolerance or threshold softens this
    // into "mostly matches". `formulaMismatches` beside `formulaCheckedPosts` is
    // what lets a reader size the finding — 1 of 5,000 and 5,000 of 5,000 both
    // read `false`, and a bare "No" cannot tell them apart.
    aggregateFormulaMatches: formulaCheckedPosts === 0 ? null : formulaMismatches === 0,
    formulaCheckedPosts,
    formulaMismatches,
  };
}

/**
 * Worst first. Lower rank sorts higher.
 *
 * ⚠️ RANK 1 IS THE REASON THIS SCREEN EXISTS: posts went to staging and none
 * came back attributed. Every other row is a lesser concern.
 *
 * Exported for the tests only — the ordering is an internal decision, and
 * nothing outside this module should branch on the number.
 */
export function severityRank(row: DataQualityRow, now: Date): number {
  // `submitted === null` means the uploads read could not be trusted, so this
  // comparison cannot be made at all — not that it passed.
  if (row.submitted !== null && row.submitted > 0 && row.attributed === 0) return 1;
  if (row.lastIngest === null) return 2;
  if (typeof row.lastIngest === "string") {
    const ms = Date.parse(row.lastIngest);
    if (!Number.isNaN(ms) && now.getTime() - ms > STALE_AFTER_DAYS * DAY_MS) return 3;
  }
  if (row.undated > 0 || row.unknownFormat > 0) return 4;
  return 5;
}

/** Per-client tallies over the BI rows, built in ONE pass. */
interface PostTally {
  attributed: number;
  undated: number;
  unknownFormat: number;
}

function tallyPosts(
  rows: BiPostRow[],
  formatMap: Map<string, string>,
): { byClient: Map<string, PostTally>; unattributed: number } {
  const byClient = new Map<string, PostTally>();
  let unattributed = 0;

  for (const row of rows) {
    // ⚠️ `client_id` IS TYPED NON-NULLABLE BUT GUARDED ANYWAY. `BiPostRow`
    // declares it `string`, while `fetchPostCounts` has always tested it for
    // null — the codebase disagrees with itself about the externally-owned
    // view's true shape. Until the view is authoritative here, trust the guard
    // over the type: an unattributed row is precisely what this screen counts,
    // so silently bucketing a null id under `""` would hide the headline figure.
    const clientId = row.client_id;
    if (!clientId) {
      unattributed += 1;
      continue;
    }

    let tally = byClient.get(clientId);
    if (!tally) {
      tally = { attributed: 0, undated: 0, unknownFormat: 0 };
      byClient.set(clientId, tally);
    }
    tally.attributed += 1;
    // Hour-age posts: no resolved publish date, so no bounded period can see
    // them. NOT `effectiveMs` — that falls back to `scraped_at` for windowing,
    // which would report these as dated when they are not.
    if (!row.estimated_post_date) tally.undated += 1;
    // ADR 0009: canonicalise at READ time. A missing attribute record and an
    // unrecognised raw value are both UNKNOWN — a real format, not an error.
    if ((toCanonicalFormat(formatMap.get(row.linkedin_post_id)) ?? "UNKNOWN") === "UNKNOWN") {
      tally.unknownFormat += 1;
    }
  }

  return { byClient, unattributed };
}

/** Per-client upload tallies: distinct posts submitted, count, newest timestamp. */
interface UploadTally {
  submitted: number;
  uploadCount: number;
  lastIngest: string | null;
}

function tallyUploads(uploads: Upload[]): Map<string, UploadTally> {
  const byClient = new Map<string, UploadTally>();
  for (const upload of uploads) {
    let tally = byClient.get(upload.clientId);
    if (!tally) {
      tally = { submitted: 0, uploadCount: 0, lastIngest: null };
      byClient.set(upload.clientId, tally);
    }
    // ⚠️ `rowsInserted` ONLY. `rowsUpdated` and `rowsUnchanged` are re-ingests of
    // posts already counted by an earlier upload; adding them would inflate
    // "submitted" every week and make the comparison against `attributed`
    // meaningless.
    tally.submitted += upload.rowsInserted;
    tally.uploadCount += 1;
    if (tally.lastIngest === null || upload.createdAt > tally.lastIngest) {
      tally.lastIngest = upload.createdAt;
    }
  }
  return byClient;
}

export interface DataQualityOptions {
  /** Injected so staleness is deterministic in tests, as `buildClientReport` does. */
  now?: Date;
}

export async function getDataQuality({
  now = new Date(),
}: DataQualityOptions = {}): Promise<DataQuality> {
  const [registry, posts, uploads] = await Promise.all([
    listClientRegistry(),
    readAllPostRows(),
    listAllUploads(),
  ]);

  // The asset type lives in the app-owned table and is joined by post id, so it
  // can only be read once the post ids are known. Already chunked by the
  // attributes seam — do not re-implement that here.
  const attributes = await listPostAttributes(posts.rows.map((r) => r.linkedin_post_id));
  const formatMap = toFormatMap(attributes);

  const { byClient: postTallies, unattributed: nullIdPosts } = tallyPosts(posts.rows, formatMap);
  const uploadTallies = uploads === null ? null : tallyUploads(uploads);

  const sources = {
    clientsUnavailable: registry === null,
    postsUnavailable: posts.unavailable,
    postsTruncated: posts.truncated,
    uploadsUnavailable: uploads === null,
  };

  const rows: DataQualityRow[] = (registry ?? []).map((client) => {
    const tally = postTallies.get(client.id);
    const uploadTally = uploadTallies?.get(client.id);

    // Three states, kept apart: a read that failed ("unavailable"), a client
    // never ingested (null), and a real timestamp.
    const lastIngest: LastUpload =
      uploadTallies === null ? "unavailable" : (uploadTally?.lastIngest ?? null);

    return {
      clientId: client.id,
      clientName: client.name,
      submitted: uploadTallies === null ? null : (uploadTally?.submitted ?? 0),
      attributed: tally?.attributed ?? 0,
      undated: tally?.undated ?? 0,
      unknownFormat: tally?.unknownFormat ?? 0,
      uploadCount: uploadTallies === null ? null : (uploadTally?.uploadCount ?? 0),
      lastIngest,
    };
  });

  // Orphans: a `client_id` the roster does not know. Counted alongside null ids
  // because both mean the same thing to staff — a post that came back attributed
  // to nobody they registered.
  const registeredIds = new Set((registry ?? []).map((c) => c.id));
  let orphanPosts = 0;
  for (const [clientId, tally] of postTallies) {
    if (!registeredIds.has(clientId)) orphanPosts += tally.attributed;
  }

  rows.sort(
    (a, b) =>
      severityRank(a, now) - severityRank(b, now) || a.clientName.localeCompare(b.clientName),
  );

  return {
    rows,
    // Needs BOTH sources: without the roster there is nothing to call an orphan,
    // and without the posts there is nothing to count.
    unattributedPosts: registry === null || posts.unavailable ? null : nullIdPosts + orphanPosts,
    // Over EVERY post read, not per client — the rate definitions are a property
    // of the pipeline, not of any one client.
    rates: reconcileRates(posts.rows),
    sources,
  };
}
