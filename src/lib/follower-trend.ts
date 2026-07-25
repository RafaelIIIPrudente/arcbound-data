import type { Upload } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Follower movement over time, derived from the app-owned upload audit.
//
// Pure and synchronous, exactly like its sibling `upload-delta.ts`: everything
// here reads the `Upload[]` the client detail page already fetched. No extra
// query, and nothing is inferred that the audit does not actually record. The
// result type is declared HERE rather than in `services/types.ts`, following the
// precedent `UploadDelta` sets — this is a derived view of data, not a service
// contract.
//
// ⚠️ FOUR STATES, AND THEY MUST NOT COLLAPSE. A failed read, a history that
// never recorded a count, a single reading, and a trend are four different
// facts. Three of them have no movement to report and each for a different
// reason, so none of them may render as "0% growth" — that would state a
// measurement where there is none.
//
// ⚠️ AND NOTHING HERE IS NORMALISED TO A RATE. Uploads are weekly-ish but not
// guaranteed; scaling an 11-day observation up to a nominal month or year
// extrapolates past what was observed, and would need a minimum-span constant to
// be defensible. Net change and percent change over a STATED span are honest
// without one.
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds in a day. A unit conversion, not a threshold. */
const DAY_MS = 86_400_000;

export interface FollowerPoint {
  /** The follower count recorded by that upload. */
  followers: number;
  /** ISO 8601 timestamp of the upload that recorded it. */
  at: string;
}

/**
 * ⚠️ A DISCRIMINATED UNION ON PURPOSE. Making the four states four shapes means
 * a caller cannot read `net` off a single reading, or a percentage off a failed
 * read — the compiler stops it rather than a convention asking nicely.
 */
export type FollowerTrend =
  /** The uploads read FAILED. Nothing is known — not "no growth". */
  | { kind: "unavailable" }
  /** Read fine, but no upload ever recorded a follower count. */
  | { kind: "none" }
  /**
   * Exactly one recorded count: a LEVEL, not a trend.
   *
   * ⚠️ There is deliberately no `net`, no `percent` and no `series` here. One
   * point has no direction; a flat line, a 0%, or a single-dot chart would each
   * imply a stability that was never observed. A trend needs a second reading.
   */
  | { kind: "single"; latest: FollowerPoint }
  | {
      kind: "trend";
      /** Every recorded point, OLDEST FIRST. Never de-duplicated. Length >= 2. */
      series: FollowerPoint[];
      /** Newest recorded count minus oldest. Signed — a decline keeps its sign. */
      net: number;
      /**
       * `net` as a percentage of the OLDEST recorded count.
       *
       * ⚠️ `null` when that count is 0. Growth from nothing has no denominator:
       * it is not infinite and it is not 100%, it is undefined, and the UI says
       * so rather than printing a number.
       */
      percent: number | null;
      /**
       * Whole days actually elapsed between the oldest and newest RECORDED
       * points — not across the whole upload history, and not a nominal cadence.
       * Every figure above is only meaningful stated over this window.
       *
       * Legitimately 0 when two readings land on the same day.
       */
      spanDays: number;
    };

/**
 * Follower readings over time, or the honest reason there is no trend.
 *
 * Uploads with no follower count are SKIPPED, never read as zero — a missing
 * count is not a drop to nothing. `followersDelta` already establishes that
 * rule and this agrees with it, so the KPI card and the chart cannot tell two
 * different stories.
 */
export function followerTrend(uploads: Upload[] | null): FollowerTrend {
  if (uploads === null) return { kind: "unavailable" };

  const points = uploads
    // ⚠️ A point needs BOTH a count and a placeable time. An unparseable
    // timestamp cannot go on a time axis at all, and defaulting it would park a
    // real reading at the epoch — the same class of lie as reading a missing
    // count as zero. Guarded the way `publishDate` and `severityRank` already
    // guard their dates.
    .filter((u) => u.followerCount != null && !Number.isNaN(Date.parse(u.createdAt)))
    .map((u) => ({ followers: u.followerCount!, at: u.createdAt }))
    // ⚠️ ORDERED BY TIME, NOT BY ARRAY POSITION. `listUploads` returns newest
    // first, but a time series is defined by its clock, so this sorts rather
    // than reversing — the ordering stays right even if a caller hands over a
    // differently-ordered array.
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  if (points.length === 0) return { kind: "none" };
  if (points.length === 1) return { kind: "single", latest: points[0]! };

  const oldest = points[0]!;
  const newest = points[points.length - 1]!;
  const net = newest.followers - oldest.followers;

  return {
    kind: "trend",
    series: points,
    net,
    percent: oldest.followers === 0 ? null : (net / oldest.followers) * 100,
    spanDays: Math.round((Date.parse(newest.at) - Date.parse(oldest.at)) / DAY_MS),
  };
}
