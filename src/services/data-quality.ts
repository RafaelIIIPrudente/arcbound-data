import { toCanonicalFormat } from "@/lib/post-format";
import type { BiPostRow } from "@/services/analytics";
import { readAllPostRows } from "@/services/bi-posts";
import { listClientRegistry } from "@/services/clients";
import { listPostAttributes, toFormatMap } from "@/services/post-attributes";
import { listAllUploads } from "@/services/uploads";
import type { DataQuality, DataQualityRow, LastUpload, Upload } from "@/services/types";

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

const DAY_MS = 86_400_000;

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
    sources,
  };
}
