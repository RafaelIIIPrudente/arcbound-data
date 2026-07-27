import type { Upload } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Movement between ingests, derived from the app-owned upload audit.
//
// Pure: everything here reads the `Upload[]` the client detail page already
// fetched. No extra query, and nothing is inferred that the audit does not
// actually record.
//
// ⚠️ `null` means THERE IS NO MOVEMENT TO REPORT — a client with one upload has
// nothing to compare against. It never means zero: a genuine zero is
// `direction: "flat"`, which the UI shows as `0`. Same rule as `postsCount`.
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadDelta {
  /** Signed change. Negative for a decline. */
  value: number;
  direction: "up" | "down" | "flat";
}

function toDelta(value: number): UploadDelta {
  return { value, direction: value > 0 ? "up" : value < 0 ? "down" : "flat" };
}

/**
 * Posts brought in by the MOST RECENT ingest.
 *
 * ⚠️ This is ArcBase's own upload audit (`rowsInserted`), while the Posts figure
 * beside it is counted from the BI view. They are adjacent pipelines, not the
 * same number: this answers "how many new posts did the last upload land", not
 * "by how much did that count above change". Attribution happens downstream
 * (ADR 0009), so the BI count can move without an upload and vice versa.
 */
export function postsDelta(uploads: Upload[] | null): UploadDelta | null {
  const latest = uploads?.[0];
  return latest ? toDelta(latest.rowsInserted) : null;
}

/**
 * Change in one per-Upload audience count, measured from the NEWEST upload back
 * to the previous one that recorded a value.
 *
 * ⚠️ ANCHORED ON THE NEWEST UPLOAD, deliberately. The card shows that upload's
 * count, so if it recorded none the card shows an em dash and there is nothing
 * for a delta to describe. Measuring between two older uploads instead would
 * print a change next to a figure that is not on screen.
 *
 * Older uploads with no count are skipped rather than read as zero — a missing
 * count is not a drop to nothing. A recorded `0` IS a reading and is used.
 */
function countDelta(
  uploads: Upload[] | null,
  pick: (upload: Upload) => number | null,
): UploadDelta | null {
  const latest = uploads?.[0];
  const latestCount = latest ? pick(latest) : null;
  if (latestCount == null) return null;

  const previous = uploads!
    .slice(1)
    .map(pick)
    .find((count) => count != null);
  if (previous == null) return null;

  return toDelta(latestCount - previous);
}

/** Follower change between the two most recent uploads that recorded a count. */
export function followersDelta(uploads: Upload[] | null): UploadDelta | null {
  return countDelta(uploads, (u) => u.followerCount);
}

/**
 * Connection change between the two most recent uploads that recorded a count.
 *
 * ⚠️ GAPS ARE THE NORM HERE, NOT THE EXCEPTION. The connection count is optional
 * at capture and no upload predating the column carries one, so most histories
 * are sparse. `countDelta` skips those uploads rather than reading them as zero,
 * which is the only thing keeping this from printing a fabricated collapse and
 * recovery every time a staffer leaves the field blank for a week.
 */
export function connectionsDelta(uploads: Upload[] | null): UploadDelta | null {
  return countDelta(uploads, (u) => u.connectionsCount);
}
