import { cookies } from "next/headers";

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
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase
      .from("uploads")
      .select("client_id, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn(`Failed to load latest uploads: ${error.message}`);
      return null;
    }

    const latest = new Map<string, string>();
    for (const row of (data ?? []) as { client_id: string; created_at: string }[]) {
      // Newest-first, so the FIRST sighting of a client is its latest upload.
      if (!latest.has(row.client_id)) latest.set(row.client_id, row.created_at);
    }
    return latest;
  } catch (err) {
    console.warn(
      `Failed to load latest uploads: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
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
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase
      .from("uploads")
      .select(UPLOAD_COLUMNS)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn(`Failed to load uploads for client ${clientId}: ${error.message}`);
      return null;
    }
    return ((data ?? []) as UploadRow[]).map(toUpload);
  } catch (err) {
    console.warn(
      `Failed to load uploads for client ${clientId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
