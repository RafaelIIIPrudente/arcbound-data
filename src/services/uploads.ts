import { cookies } from "next/headers";

import { asPage, readAllPages, type PageReader } from "@/lib/supabase/paged";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Upload } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Uploads seam (real, read-only). Reads the app-owned public.uploads audit via
// the session-aware server client. Uploads are IMMUTABLE — written only by the
// ingest_metrics RPC — so there is deliberately no insert/update/delete here.
// Degrades to [] (never crashes the page) if the read fails.
// ─────────────────────────────────────────────────────────────────────────────

/** A row of public.uploads (no generated types — the shape is known + stable). */
interface UploadRow {
  id: string;
  client_id: string;
  source_type: string;
  rows_inserted: number;
  rows_updated: number;
  rows_unchanged: number;
  follower_count: number | null;
  created_at: string;
}

const UPLOAD_COLUMNS =
  "id, client_id, source_type, rows_inserted, rows_updated, rows_unchanged, follower_count, created_at";

function toUpload(row: UploadRow): Upload {
  return {
    id: row.id,
    clientId: row.client_id,
    // source_type is a checked text column ('csv'|'json'); coerce to SourceType.
    sourceType: row.source_type === "json" ? "json" : "csv",
    rowsInserted: row.rows_inserted,
    rowsUpdated: row.rows_updated,
    rowsUnchanged: row.rows_unchanged,
    followerCount: row.follower_count,
    createdAt: row.created_at,
  };
}

/**
 * A `PageReader` over `public.uploads`, newest first.
 *
 * ⚠️ THE `id` TIEBREAK IS LOAD-BEARING. `created_at` alone is not a total order —
 * two uploads can share a timestamp — and pages 1..n are issued CONCURRENTLY, so
 * an ambiguous sort lets the database return a row twice across two ranges, or
 * not at all. The tiebreak makes the order total.
 */
function uploadPageReader<T>(columns: string, clientId?: string): PageReader<T> {
  let supabase: ReturnType<typeof createServerClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createServerClient(cookies());
    const base = supabase.from("uploads").select(columns, opts);
    const scoped = clientId === undefined ? base : base.eq("client_id", clientId);
    return asPage<T>(
      scoped
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
  };
}

/**
 * Newest upload timestamp PER CLIENT, in ONE query.
 *
 * ⚠️ EXISTS TO PREVENT AN N+1. The Client List needs each row's last ingest;
 * calling `listUploads` per row would be one round-trip per client. This reads
 * two columns for every upload, newest-first, and keeps the first row it sees
 * per client — PostgREST has no `DISTINCT ON`, so the de-dupe happens here.
 *
 * Returns `null` when the read FAILS, never an empty map. An empty map is a
 * real answer ("nobody has been ingested"); conflating the two would let a
 * broken read render as a confident fact — the same defect that made every
 * unreadable post count look like a zero.
 */
export async function latestUploadByClient(): Promise<Map<string, string> | null> {
  const { rows, unavailable, truncated } = await readAllPages(
    uploadPageReader<{ client_id: string; created_at: string }>("client_id, created_at"),
    "public.uploads",
  );

  // ⚠️ TRUNCATION RETURNS `null`, EXACTLY AS FAILURE DOES.
  //
  // This read is NEWEST-FIRST, so a cap drops the OLDEST rows — and with them,
  // whole dormant clients. A partial map would report those clients as absent,
  // which the Client List renders as "Never" ingested: a broken read wearing the
  // costume of a confident fact, which is the very collapse the doc above warns
  // against. "We don't know" is the only honest answer here.
  if (unavailable || truncated) return null;

  const latest = new Map<string, string>();
  for (const row of rows) {
    // Newest-first, so the FIRST sighting of a client is its latest upload.
    if (!latest.has(row.client_id)) latest.set(row.client_id, row.created_at);
  }
  return latest;
}

/**
 * An optional out-parameter for callers that must tell a FAILED read from an
 * OVERSIZED one.
 *
 * ⚠️ TWO FACTS THAT USED TO SHARE ONE CHANNEL. `listAllUploads` returns `null`
 * for both a read that FAILED and one too large to read in full. That is SAFE —
 * neither ever prints a wrong number — but it collapses two facts a screen would
 * word differently: "could not be read" versus "too many uploads to read at
 * once". Pass this and read `truncated` after the call — `null` with
 * `truncated: true` is oversized; `null` with `truncated: false` is failed.
 *
 * ⚠️ WHY AN OUT-PARAMETER, NOT A RICHER RETURN TYPE. The return MUST stay
 * `Upload[] | null`: the Data Quality service reads it as `uploads === null ?
 * … : tallyUploads(uploads)`, and that file is out of scope to change. A
 * discriminated return would force an edit there — and, worse, any shape that
 * exposed the partial rows would tempt a caller into treating a partial audit as
 * complete. Keeping the array-or-null channel untouched and adding a SEPARATE,
 * opt-in channel is the smallest change that gives the distinction to callers
 * that want it while leaving every current caller honest. It mirrors the
 * `failure` object `clientPageReader` uses for the same reason.
 */
export interface UploadReadOutcome {
  /** True when the read SUCCEEDED but hit the pager's page cap. Never true on a failed read. */
  truncated: boolean;
}

/**
 * EVERY upload for every client, newest first.
 *
 * `null` on failure OR truncation — a partial audit trail would understate what
 * each client submitted, and "submitted" is the figure the Data Quality screen
 * compares against what came back attributed. Pass `outcome` to tell those two
 * `null`s apart (see {@link UploadReadOutcome}).
 */
export async function listAllUploads(outcome?: UploadReadOutcome): Promise<Upload[] | null> {
  const { rows, unavailable, truncated } = await readAllPages(
    uploadPageReader<UploadRow>(UPLOAD_COLUMNS),
    "public.uploads",
  );
  // Written whether or not the read succeeded, so a caller sees `false` on a
  // FAILED read (which is not truncated) and `true` only on a real cap hit.
  if (outcome) outcome.truncated = truncated;
  if (unavailable || truncated) return null;
  return rows.map(toUpload);
}

/**
 * One client's uploads, newest first.
 *
 * ⚠️ Returns `null` when the read FAILS — never an empty array. `[]` is a real
 * answer ("this client has never been ingested"); returning it for a failed read
 * made the detail page show `0` uploads and "No uploads yet", asserting a fact
 * it did not have. Same rule as `Client.postsCount`: absence of data and a
 * confirmed zero are different, and the UI keeps them apart.
 */
export async function listUploads(clientId: string): Promise<Upload[] | null> {
  const { rows, unavailable, truncated } = await readAllPages(
    uploadPageReader<UploadRow>(UPLOAD_COLUMNS, clientId),
    "public.uploads",
  );

  // ⚠️ TRUNCATION RETURNS `null` TOO, AND THAT IS THE POINT OF PAGING THIS READ.
  //
  // It was unpaged, so above the cap it returned 1000 rows and a 200. This read
  // is NEWEST-FIRST, so a cap drops the OLDEST uploads — and `follower-trend.ts`
  // now draws a series from it. A capped read would have silently CROPPED the
  // left-hand end of that chart while presenting it as the client's whole
  // history. "We don't know" is the only honest answer; the detail page already
  // renders `null` as an unavailable banner rather than as an empty history.
  if (unavailable || truncated) return null;

  return rows.map(toUpload);
}
