import { cookies } from "next/headers";
import { z } from "zod";

import { buildSnippet, isConfidentFormat } from "@/lib/parse-metrics";
import { resolvePostDate } from "@/lib/post-date";
import { createClient } from "@/lib/supabase/server";
import type { IngestResult, PostRow, ReviewPost, SourceType } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Ingest seam (real). ONE call to the atomic `ingest_metrics` RPC writes ONE
// store: the app-owned, TYPED `public.posts`, attributed by a real `client_id`
// foreign key stamped from the operator's own selection (ADR 0010).
//
// ⚠️ IT USED TO WRITE TWO. Through the cutover this same RPC also upserted the
// all-text `public.linkedin_posts_staging`, so that an external view layer could
// keep serving reads while `public.posts` filled up. That dual-write is gone;
// the staging table still exists and is no longer written by anything.
//
// ⚠️ THE TYPING HAPPENS HERE, IN TYPESCRIPT, NOT IN THE DATABASE, and it is
// ArcBase's own responsibility now rather than an external view's. The
// four-state discipline is inheritable only if it is testable: every rule below
// is a unit test in ingest.test.ts, and the RPC receives values that are already
// typed and already date-resolved.
//
// The all-or-nothing FORMAT REVIEW gate stays here: when a row's format is
// unknown and neither resolved nor skipped, we return `review` WITHOUT calling
// the RPC (no write). The pure bits (review gate, resolved-format application,
// typing) are exported for hermetic unit tests.
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestInput {
  clientId: string;
  sourceType: SourceType;
  rows: PostRow[];
  followerCount: number;
  /**
   * The Client's LinkedIn connection count at capture — OPTIONAL, unlike
   * `followerCount`.
   *
   * ⚠️ ABSENT IS NOT ZERO. Undefined/null both mean the scrape carried no count
   * and are written to the audit row as SQL null; a `0` would record a
   * measurement nobody took into an immutable row that can never be corrected.
   */
  connectionsCount?: number | null;
  /** linkedin_post_id → chosen format, from the review step. */
  resolvedFormatTypes?: Record<string, string>;
  /** Trust the scraper: write unknown formats as-is instead of reviewing. */
  skipReview?: boolean;
}

type SeamResult = Extract<IngestResult, { status: "review" | "ok" }>;

/**
 * The confident format for a row: its own confident format, else a resolved
 * choice, else null (→ review). Returns the value exactly as received — raw
 * casing is preserved all the way to the RPC (ADR 0009).
 */
export function resolveFormat(row: PostRow, resolved?: Record<string, string>): string | null {
  const own = row.post_format_type;
  if (own !== undefined && isConfidentFormat(own)) return own;
  const chosen = resolved?.[row.linkedin_post_id];
  if (chosen !== undefined && isConfidentFormat(chosen)) return chosen;
  return null;
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

// ── Typing: the four-state rules of ADR 0010 D4, in one place ────────────────

/**
 * The metric fields the typing reads, WIDENED to admit the absent state.
 *
 * ⚠️ `PostRow` types the five required metrics as plain `number`, because
 * `parse-metrics.ts` rejects the whole upload when one of them is unreadable —
 * so on today's live path they can never arrive null. This shape admits null
 * anyway, and every rule below is written and tested against it, for two
 * reasons: the historical backfill applies the SAME rules to all-text staging
 * where any column can be unreadable, and a future relaxation of the parser must
 * not silently start producing zeros. `PostRow` is assignable to this.
 */
interface RawMetrics {
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  engagement_rate: number | null;
  saves: number | null;
  post_date?: string;
  scraped_at: string;
}

/**
 * The typed siblings that populate `public.posts`. Every one is nullable, and
 * that is the point — see D4. A `number` here is a measurement; `null` is the
 * absence of one, and the two never collapse.
 */
export interface TypedMetrics {
  n_impressions: number | null;
  n_likes: number | null;
  n_comments: number | null;
  n_reposts: number | null;
  n_saves: number | null;
  n_interactions: number | null;
  n_provided_rate: number | null;
  n_calculated_rate: number | null;
  n_estimated_post_date: string | null;
}

/** One element of `p_rows`: the raw scrape keys plus their typed siblings. */
export type IngestRpcRow = PostRow & TypedMetrics;

/** A real measurement, or null. `0` is a measurement; NaN and absence are not. */
function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Type and derive one row's metrics.
 *
 * ⚠️ EVERY RULE HERE EXISTS TO KEEP FOUR STATES APART. Read D4 in
 * `docs/specs/2026-08-19-analytics-ownership-execution.md` before changing one.
 */
export function typedMetrics(row: RawMetrics): TypedMetrics {
  const impressions = finite(row.impressions);
  const likes = finite(row.likes);
  const comments = finite(row.comments);
  const reposts = finite(row.reposts);

  // ⚠️ NULL IF ANY COMPONENT IS NULL. A partial sum presented as a total is the
  // same lie as a null presented as a zero: "10 interactions" would be indistin-
  // guishable from "10 that we could read, plus an unknown number we could not".
  //
  // ⚠️ SAVES ARE NOT A TERM. The scrape's own engagement_rate reconciles exactly
  // against (likes + comments + reposts) / impressions on every sample row in
  // this repo, so adding saves would silently restate every published total.
  const interactions =
    likes === null || comments === null || reposts === null ? null : likes + comments + reposts;

  // ⚠️ NULL WHEN IMPRESSIONS IS NULL **OR ZERO**. Zero impressions is a real
  // measurement, but it makes the rate undefined — not 0%. A fabricated 0% would
  // drag every average that touches it toward a number nobody measured.
  // Expressed as a PERCENTAGE to match `data-quality.ts`, which reconciles this
  // against `(interactions / impressions) * 100`.
  const calculatedRate =
    interactions === null || impressions === null || impressions === 0
      ? null
      : (interactions / impressions) * 100;

  return {
    n_impressions: impressions,
    n_likes: likes,
    n_comments: comments,
    n_reposts: reposts,
    n_saves: finite(row.saves),
    n_interactions: interactions,
    // The scrape's own figure, stored underived so the Data Quality panel can
    // keep reconciling the two against each other.
    n_provided_rate: finite(row.engagement_rate),
    n_calculated_rate: calculatedRate,
    n_estimated_post_date: resolvePostDate(row.post_date, row.scraped_at),
  };
}

/**
 * Attach the typed siblings to every row, leaving the raw keys untouched.
 *
 * ⚠️ ONE ARRAY, NOT TWO. The RPC loops this once and writes both stores from the
 * same element. Two parallel arrays could differ in length or order, and the
 * database would have no way to notice.
 */
export function attachTypedMetrics(rows: PostRow[]): IngestRpcRow[] {
  return rows.map((row) => ({ ...row, ...typedMetrics(row) }));
}

// The RPC returns { inserted, updated, unchanged }; validate at the boundary.
const summarySchema = z.object({
  inserted: z.coerce.number().int().nonnegative(),
  updated: z.coerce.number().int().nonnegative(),
  unchanged: z.coerce.number().int().nonnegative(),
});

export async function ingestMetrics(input: IngestInput): Promise<SeamResult> {
  const {
    clientId,
    sourceType,
    rows,
    followerCount,
    connectionsCount,
    resolvedFormatTypes,
    skipReview,
  } = input;

  // Review gate — no write happens on this branch (invariant #4).
  const reviewPosts = computeReviewPosts(rows, resolvedFormatTypes, skipReview);
  if (reviewPosts.length > 0) {
    return { status: "review", posts: reviewPosts };
  }

  // Formats settled first, then typed — so `posts` records the SAME format the
  // operator reviewed, not the raw one the scrape guessed at.
  const preparedRows = attachTypedMetrics(applyResolvedFormats(rows, resolvedFormatTypes));

  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("ingest_metrics", {
    p_client_id: clientId,
    p_source_type: sourceType,
    p_rows: preparedRows,
    p_follower_count: followerCount,
    // ⚠️ ALWAYS SENT, AND `?? null` RATHER THAN `?? 0`. Explicitly null tells the
    // RPC "no count was captured"; omitting the key would leave the parameter
    // unbound, and a 0 would fabricate a reading.
    p_connections_count: connectionsCount ?? null,
  });
  if (error) {
    throw new Error(`Ingest failed: ${error.message}`);
  }

  const summary = summarySchema.parse(data);
  return { status: "ok", summary };
}
