import { buildSnippet, isValidFormat } from "@/lib/parse-metrics";
import type { IngestResult, PostRow, SourceType } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Mock ingest seam. Keeps its OWN in-memory Posts store keyed on
// `linkedin_post_id` and computes insert/update/unchanged counts. Ingestion is
// all-or-nothing: when new Posts arrive without a confident format and the caller
// hasn't skipped or resolved them, it returns `review` and writes NOTHING.
//
// Self-contained this pass (ADR 0003): it does not touch the clients or
// analytics mocks. To go live, swap the body for the real ingestion RPC — the
// signature stays identical. Deterministic (no Date.now/random).
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestInput {
  clientId: string;
  sourceType: SourceType;
  rows: PostRow[];
  followerCount: number;
  /** linkedin_post_id → chosen format, from the review step. */
  resolvedFormatTypes?: Record<string, string>;
  /** Trust the scraper: write unknown formats as null instead of reviewing. */
  skipReview?: boolean;
}

type SeamResult = Extract<IngestResult, { status: "review" | "ok" }>;

/** A stored Post: the metrics that determine "changed" plus its resolved format. */
interface StoredPost {
  impressions: number;
  likes: number;
  comments: number;
  reposts: number;
  engagement_rate: number;
  saves: number | null;
  post_format_type: string | null;
}

// Keyed on linkedin_post_id. Module-level so re-uploads see prior state.
const store = new Map<string, StoredPost>();

function resolveFormat(row: PostRow, resolved?: Record<string, string>): string | null {
  if (isValidFormat(row.post_format_type)) return row.post_format_type;
  const chosen = resolved?.[row.linkedin_post_id];
  return isValidFormat(chosen) ? chosen : null;
}

function metricsChanged(prev: StoredPost, row: PostRow): boolean {
  return (
    prev.impressions !== row.impressions ||
    prev.likes !== row.likes ||
    prev.comments !== row.comments ||
    prev.reposts !== row.reposts ||
    prev.engagement_rate !== row.engagement_rate ||
    prev.saves !== row.saves
  );
}

export async function ingestMetrics(input: IngestInput): Promise<SeamResult> {
  const { rows, resolvedFormatTypes, skipReview } = input;

  // New Posts (not yet stored) whose format is still unknown after applying any
  // resolved choices — these gate the write unless the caller skips review.
  const needsReview = rows.filter(
    (row) =>
      !store.has(row.linkedin_post_id) &&
      resolveFormat(row, resolvedFormatTypes) === null &&
      !isValidFormat(row.post_format_type),
  );

  if (!skipReview && needsReview.length > 0) {
    return {
      status: "review",
      posts: needsReview.map((row) => ({
        linkedin_post_id: row.linkedin_post_id,
        snippet: buildSnippet(row),
      })),
    };
  }

  // All-or-nothing: only reached once the whole batch is writable.
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of rows) {
    const record: StoredPost = {
      impressions: row.impressions,
      likes: row.likes,
      comments: row.comments,
      reposts: row.reposts,
      engagement_rate: row.engagement_rate,
      saves: row.saves,
      post_format_type: resolveFormat(row, resolvedFormatTypes),
    };
    const prev = store.get(row.linkedin_post_id);
    if (!prev) {
      inserted += 1;
      store.set(row.linkedin_post_id, record);
    } else if (metricsChanged(prev, row)) {
      updated += 1;
      store.set(row.linkedin_post_id, record);
    } else {
      unchanged += 1;
    }
  }

  return { status: "ok", summary: { inserted, updated, unchanged } };
}
