import { cookies } from "next/headers";
import { z } from "zod";

import { buildSnippet, isValidFormat } from "@/lib/parse-metrics";
import { createClient } from "@/lib/supabase/server";
import type { IngestResult, PostRow, ReviewPost, SourceType } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Ingest seam (real). Writes RAW scraped rows into the externally-owned
// public.linkedin_posts_staging via the atomic `ingest_metrics` RPC (ADR 0009),
// which tallies inserted/updated/unchanged and records one public.uploads row.
//
// The all-or-nothing FORMAT REVIEW gate stays here: when a row's format is
// unknown and neither resolved nor skipped, we return `review` WITHOUT calling
// the RPC (no write). The pure bits (review gate, resolved-format application)
// are exported for hermetic unit tests. ArcBase writes raw values — the BI views
// do all cleaning/typing/date-resolution/name-matching.
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestInput {
  clientId: string;
  sourceType: SourceType;
  rows: PostRow[];
  followerCount: number;
  /** linkedin_post_id → chosen format, from the review step. */
  resolvedFormatTypes?: Record<string, string>;
  /** Trust the scraper: write unknown formats as-is instead of reviewing. */
  skipReview?: boolean;
}

type SeamResult = Extract<IngestResult, { status: "review" | "ok" }>;

/** The confident format for a row: its own valid format, else a resolved choice, else null. */
export function resolveFormat(row: PostRow, resolved?: Record<string, string>): string | null {
  if (isValidFormat(row.post_format_type)) return row.post_format_type;
  const chosen = resolved?.[row.linkedin_post_id];
  return isValidFormat(chosen) ? chosen : null;
}

/**
 * Pure review gate: the rows whose format is still unknown after applying any
 * resolved choices. Empty when `skipReview` is set or every row is covered.
 */
export function computeReviewPosts(
  rows: PostRow[],
  resolvedFormatTypes: Record<string, string> | undefined,
  skipReview: boolean | undefined,
): ReviewPost[] {
  if (skipReview) return [];
  return rows
    .filter((row) => resolveFormat(row, resolvedFormatTypes) === null)
    .map((row) => ({ linkedin_post_id: row.linkedin_post_id, snippet: buildSnippet(row) }));
}

/**
 * Pure row→row prep for the RPC: set each row's `post_format_type` to its
 * resolved value (own valid format, resolved choice, or null). Values are still
 * written raw by the RPC — this only settles the reviewed format.
 */
export function applyResolvedFormats(
  rows: PostRow[],
  resolvedFormatTypes?: Record<string, string>,
): PostRow[] {
  return rows.map((row) => ({
    ...row,
    post_format_type: resolveFormat(row, resolvedFormatTypes) ?? undefined,
  }));
}

// The RPC returns { inserted, updated, unchanged }; validate at the boundary.
const summarySchema = z.object({
  inserted: z.coerce.number().int().nonnegative(),
  updated: z.coerce.number().int().nonnegative(),
  unchanged: z.coerce.number().int().nonnegative(),
});

export async function ingestMetrics(input: IngestInput): Promise<SeamResult> {
  const { clientId, sourceType, rows, followerCount, resolvedFormatTypes, skipReview } = input;

  // Review gate — no write happens on this branch (invariant #4).
  const reviewPosts = computeReviewPosts(rows, resolvedFormatTypes, skipReview);
  if (reviewPosts.length > 0) {
    return { status: "review", posts: reviewPosts };
  }

  const preparedRows = applyResolvedFormats(rows, resolvedFormatTypes);

  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("ingest_metrics", {
    p_client_id: clientId,
    p_source_type: sourceType,
    p_rows: preparedRows,
    p_follower_count: followerCount,
  });
  if (error) {
    throw new Error(`Ingest failed: ${error.message}`);
  }

  const summary = summarySchema.parse(data);
  return { status: "ok", summary };
}
