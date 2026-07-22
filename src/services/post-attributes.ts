import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { PostAttributes } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Post attributes seam (read-only). The externally-owned `bi.linkedin_post_latest`
// exposes seventeen columns and `post_format_type` is NOT among them, and Shay's
// view is out of scope to change. ArcBase already knows each post's format — its
// own upload review gate resolves it — so `ingest_metrics` records it in the
// app-owned `public.post_attributes` and this seam joins it back to the BI rows
// at read time.
//
// ⚠️ RAW STORAGE (ADR 0009). `post_format_type` is stored exactly as the Scrape
// sent it, so this table can legitimately hold MIXED-CASE variants of the same
// format ("DOCUMENT" and "document" are two distinct strings here). Anything
// that GROUPS by asset type must first canonicalise with `toCanonicalFormat`
// from `@/lib/post-format` — never group on the raw string, or one format will
// split across several buckets in the report.
//
// A missing format record degrades to "unknown": reads return [] on error
// rather than throwing, so a page never crashes over a missing attribute row.
// ─────────────────────────────────────────────────────────────────────────────

const ATTRIBUTE_COLUMNS = "linkedin_post_id, post_format_type, recorded_at";

/**
 * Ids per query. PostgREST puts an `in` filter in the query string, so a client
 * with a large post history would otherwise blow the URL length limit.
 */
export const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * The recorded attributes for the given post ids. Chunked, and degrades to []
 * (never throws) so a failed read shows posts as unknown rather than erroring
 * the page.
 */
export async function listPostAttributes(postIds: string[]): Promise<PostAttributes[]> {
  if (postIds.length === 0) return [];

  try {
    const supabase = createClient(cookies());

    // The chunks are independent, so they go out together rather than costing
    // one serial round-trip each. `Promise.all` preserves INPUT order, which
    // keeps the flattened result in chunk order — byte-identical to the loop
    // this replaced. Do not swap it for a construct that resolves out of order.
    const results = await Promise.all(
      chunk(postIds, CHUNK_SIZE).map((ids) =>
        supabase.from("post_attributes").select(ATTRIBUTE_COLUMNS).in("linkedin_post_id", ids),
      ),
    );

    // ⚠️ CHECK EVERY CHUNK BEFORE RETURNING ANYTHING.
    //
    // Supabase RESOLVES with `{ error }` for a query error rather than
    // rejecting, so a failed chunk arrives looking like a normal result. The
    // serial loop short-circuited on the first failure and returned []; now
    // that all chunks are already in flight, later ones can fail after earlier
    // ones have succeeded. Returning what did succeed would be a silent partial
    // result — a change to the contract dressed up as an optimisation.
    //
    // Scanning in order also reports the SAME chunk's message the loop did.
    for (const { error } of results) {
      if (error) {
        console.warn(`Failed to load post attributes: ${error.message}`);
        return [];
      }
    }

    return results.flatMap(({ data }) => (data ?? []) as PostAttributes[]);
  } catch (err) {
    console.warn(
      `Failed to load post attributes: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Pure: post id → its RAW recorded format. Rows with no recorded format are
 * omitted, so a lookup miss and an unrecorded format read the same to callers.
 *
 * The values are raw (see the module note) — canonicalise before grouping.
 */
export function toFormatMap(rows: PostAttributes[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.post_format_type != null) {
      map.set(row.linkedin_post_id, row.post_format_type);
    }
  }
  return map;
}
