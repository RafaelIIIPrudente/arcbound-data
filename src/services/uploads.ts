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

export async function listUploads(clientId: string): Promise<Upload[]> {
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase
      .from("uploads")
      .select(UPLOAD_COLUMNS)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn(`Failed to load uploads for client ${clientId}: ${error.message}`);
      return [];
    }
    return ((data ?? []) as UploadRow[]).map(toUpload);
  } catch (err) {
    console.warn(
      `Failed to load uploads for client ${clientId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
