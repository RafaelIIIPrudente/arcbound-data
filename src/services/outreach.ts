import { cookies } from "next/headers";
import { z } from "zod";

import { asPage, readAllPages, type PageReader } from "@/lib/supabase/paged";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type {
  LatestSnapshot,
  NamedSnapshot,
  OutreachProspect,
  OutreachRow,
  OutreachUpload,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Outreach System seam (ADR 0012). Writes whole snapshots through the atomic
// `ingest_outreach` RPC and reads them back from the app-owned
// public.outreach_uploads / public.outreach_prospects.
//
// Snapshots are IMMUTABLE — written only by the RPC — so there is deliberately
// no update or delete here.
//
// ⚠️ EVERY WHOLE-TABLE READ IS PAGED, AND ON THIS TABLE THAT IS NOT PRECAUTION.
// One snapshot is ~1,435 rows against PostgREST's silent 1000-row response cap:
// an unpaged read returns 1000 rows and a 200, so the very first upload would
// render a funnel short by 435 prospects and look completely healthy doing it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A row of public.outreach_uploads (no generated types — the shape is ours).
 *
 * ⚠️ EXPORTED SO A TEST CAN HOLD IT TO ACCOUNT, LIKE `ProspectRow` BELOW.
 * `outreach.test.ts` type-annotates a fixture `: UploadRow` and diffs its keys
 * against `UPLOAD_COLUMNS` — the structural guard `asPage` cannot provide (see
 * its comment).
 */
export interface UploadRow {
  id: string;
  client_id: string;
  row_count: number;
  created_at: string;
  has_email_channel: boolean;
}

/**
 * A row of public.outreach_prospects. Every source column is text.
 *
 * ⚠️ EXPORTED SO A TEST CAN HOLD IT TO ACCOUNT. `outreach.test.ts` type-annotates
 * a fixture `: ProspectRow` and diffs its keys against `PROSPECT_COLUMNS` — the
 * structural guard that catches the pair drifting apart, which `asPage` below
 * cannot (see its comment).
 */
export interface ProspectRow {
  id: string | number;
  outreach_upload_id: string;
  client_id: string;
  row_index: number;
  full_name: string | null;
  title: string | null;
  company: string | null;
  icp_seg: string | null;
  why_they_fit: string | null;
  what_they_lack: string | null;
  what_arcbound_offers: string | null;
  matching_client_archetype: string | null;
  linkedin_url: string | null;
  location: string | null;
  source_citation: string | null;
  rationale: string | null;
  linkedin_message: string | null;
  connection_status: string | null;
  date_sent: string | null;
  reply_status: string | null;
  follow_up_count: string | null;
  last_follow_up_date: string | null;
  next_touch_date: string | null;
  meeting_booked_date: string | null;
  stage: string | null;
  owner: string | null;
  notes: string | null;
  qualified_icp: string | null;
  email_best_email: string | null;
  email_mobile: string | null;
  email_subject_line: string | null;
  email_message: string | null;
  email_status: string | null;
  email_date_emailed: string | null;
  email_reply_status: string | null;
  email_follow_up_count: string | null;
  email_last_follow_up_date: string | null;
  email_next_touch_date: string | null;
  email_webinar_registered: string | null;
  email_meeting_booked_date: string | null;
  email_stage: string | null;
  email_owner: string | null;
  email_notes: string | null;
}

// ⚠️ AN OMITTED COLUMN IS A SILENT, PERMANENT GAP — same rule as
// `PROSPECT_COLUMNS` below. This list and `UploadRow` are a PAIR that
// `outreach.test.ts` holds to account structurally. Exported for that test only.
export const UPLOAD_COLUMNS = "id, client_id, row_count, created_at, has_email_channel";

// ⚠️ AN OMITTED COLUMN IS A SILENT, PERMANENT GAP. PostgREST returns exactly the
// columns asked for, so a name left out here maps to `undefined` on every row —
// a whole field reading as "never recorded", with no error anywhere to explain
// it. This list and `ProspectRow` are a PAIR: `asPage` asserts the row type
// rather than checking it, so editing one without the other compiles fine and
// lies at runtime. `outreach.test.ts` holds the pair to account structurally —
// see `ProspectRow`'s comment. Exported for that test only.
export const PROSPECT_COLUMNS = [
  "id",
  "outreach_upload_id",
  "client_id",
  "row_index",
  "full_name",
  "title",
  "company",
  "icp_seg",
  "why_they_fit",
  "what_they_lack",
  "what_arcbound_offers",
  "matching_client_archetype",
  "linkedin_url",
  "location",
  "source_citation",
  "rationale",
  "linkedin_message",
  "connection_status",
  "date_sent",
  "reply_status",
  "follow_up_count",
  "last_follow_up_date",
  "next_touch_date",
  "meeting_booked_date",
  "stage",
  "owner",
  "notes",
  "qualified_icp",
  "email_best_email",
  "email_mobile",
  "email_subject_line",
  "email_message",
  "email_status",
  "email_date_emailed",
  "email_reply_status",
  "email_follow_up_count",
  "email_last_follow_up_date",
  "email_next_touch_date",
  "email_webinar_registered",
  "email_meeting_booked_date",
  "email_stage",
  "email_owner",
  "email_notes",
].join(", ");

function toUpload(row: UploadRow): OutreachUpload {
  return {
    id: row.id,
    clientId: row.client_id,
    rowCount: row.row_count,
    createdAt: row.created_at,
    hasEmailChannel: row.has_email_channel,
  };
}

/**
 * snake_case row → camelCase prospect.
 *
 * ⚠️ `?? null` EVERYWHERE, NEVER `?? ""` AND NEVER `?? 0`. A blank cell was
 * stored as SQL null on purpose, and that null is the answer: `next_touch_date`
 * is filled on 2 rows of 1,435, so "no value" is the ordinary state of this data
 * rather than a hole to be plugged. An empty string would read as present to any
 * downstream truthiness test, and a 0 would invent a measurement.
 */
function toProspect(row: ProspectRow): OutreachProspect {
  return {
    id: String(row.id),
    outreachUploadId: row.outreach_upload_id,
    clientId: row.client_id,
    rowIndex: row.row_index,
    fullName: row.full_name ?? null,
    title: row.title ?? null,
    company: row.company ?? null,
    icpSeg: row.icp_seg ?? null,
    whyTheyFit: row.why_they_fit ?? null,
    whatTheyLack: row.what_they_lack ?? null,
    whatArcboundOffers: row.what_arcbound_offers ?? null,
    matchingClientArchetype: row.matching_client_archetype ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    location: row.location ?? null,
    sourceCitation: row.source_citation ?? null,
    rationale: row.rationale ?? null,
    linkedinMessage: row.linkedin_message ?? null,
    connectionStatus: row.connection_status ?? null,
    dateSent: row.date_sent ?? null,
    replyStatus: row.reply_status ?? null,
    followUpCount: row.follow_up_count ?? null,
    lastFollowUpDate: row.last_follow_up_date ?? null,
    nextTouchDate: row.next_touch_date ?? null,
    meetingBookedDate: row.meeting_booked_date ?? null,
    stage: row.stage ?? null,
    owner: row.owner ?? null,
    notes: row.notes ?? null,
    qualifiedIcp: row.qualified_icp ?? null,
    emailBestEmail: row.email_best_email ?? null,
    emailMobile: row.email_mobile ?? null,
    emailSubjectLine: row.email_subject_line ?? null,
    emailMessage: row.email_message ?? null,
    emailStatus: row.email_status ?? null,
    emailDateEmailed: row.email_date_emailed ?? null,
    emailReplyStatus: row.email_reply_status ?? null,
    emailFollowUpCount: row.email_follow_up_count ?? null,
    emailLastFollowUpDate: row.email_last_follow_up_date ?? null,
    emailNextTouchDate: row.email_next_touch_date ?? null,
    emailWebinarRegistered: row.email_webinar_registered ?? null,
    emailMeetingBookedDate: row.email_meeting_booked_date ?? null,
    emailStage: row.email_stage ?? null,
    emailOwner: row.email_owner ?? null,
    emailNotes: row.email_notes ?? null,
  };
}

// The RPC returns { upload_id, row_count }; validate at the boundary so a
// malformed envelope fails loudly here rather than rendering as "undefined rows
// ingested" on the upload screen.
const ingestSummarySchema = z.object({
  upload_id: z.string().min(1),
  row_count: z.coerce.number().int().nonnegative(),
});

/**
 * Write one whole snapshot.
 *
 * ⚠️ ATTRIBUTION IS `clientId` AND NOTHING ELSE. No field of the file is
 * consulted to decide whose data this is — `owner` is "Bryan" on 1,432 of 1,435
 * rows and `matching_client_archetype` mixes generic archetypes with real client
 * names, so either would be a name-match, which is the failure ADR 0009 records
 * and ADR 0012 rules out.
 *
 * ⚠️ ROWS GO THROUGH UNTOUCHED. No dedupe, no trim, no coercion — the parser has
 * already decided what is blank, and the RPC copies values straight into text
 * columns. The source contains genuine duplicate prospects and they must all be
 * stored (ADR 0012).
 *
 * ⚠️ `p_has_email_channel` IS ALWAYS `true` HERE, NOT A CALLER-SUPPLIED FLAG.
 * `parseOutreachCsv` requires all 39 headers (D3, 2026-08-03): a file missing
 * even one of the 15 `Email — *` columns is a hard parse error that never
 * reaches this function. So every `rows` array this function is ever called
 * with already came from a file that carried the email block — there is no live
 * decision to make, only a fact to record. A snapshot written before the email
 * channel existed keeps `outreach_uploads.has_email_channel`'s database-level
 * `default false`; this function never writes `false` for anything it ingests.
 */
export async function ingestOutreach(
  clientId: string,
  rows: OutreachRow[],
): Promise<{ uploadId: string; rowCount: number }> {
  const supabase = createServerClient(cookies());
  const { data, error } = await supabase.rpc("ingest_outreach", {
    p_client_id: clientId,
    p_rows: rows,
    p_has_email_channel: true,
  });
  if (error) {
    throw new Error(`Outreach ingest failed: ${error.message}`);
  }

  const summary = ingestSummarySchema.parse(data);
  return { uploadId: summary.upload_id, rowCount: summary.row_count };
}

/**
 * A `PageReader` over `public.outreach_uploads` for one Client, newest first.
 *
 * ⚠️ THE `id` TIEBREAK IS LOAD-BEARING. `created_at` alone is not a total order —
 * two uploads can share a timestamp — and pages 1..n are issued CONCURRENTLY, so
 * an ambiguous sort lets the database return a row twice across two ranges, or
 * not at all.
 */
function uploadPageReader(clientId: string): PageReader<UploadRow> {
  let supabase: ReturnType<typeof createServerClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createServerClient(cookies());
    return asPage<UploadRow>(
      supabase
        .from("outreach_uploads")
        .select(UPLOAD_COLUMNS, opts)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
  };
}

/**
 * A `PageReader` over one snapshot's prospects, in source order.
 *
 * ⚠️ FILTERED BY `outreach_upload_id`, NOT ONLY BY CLIENT. Every upload
 * re-stores all ~1,435 rows, so after two uploads a Client has ~2,870 rows in
 * this table and only the upload id separates one snapshot from the next.
 * Filtering by client alone would silently double every count on the dashboard.
 *
 * ⚠️ ORDERED BY `id`, NOT `row_index`. `row_index` repeats across snapshots and
 * is therefore not a total order over the table; `id` is the only unique key,
 * and concurrent pages need one. Ordering by `id` still yields source order
 * within a snapshot, because the identity column is assigned in insert order and
 * the RPC inserts the file in order.
 */
function prospectPageReader(clientId: string, uploadId: string): PageReader<ProspectRow> {
  let supabase: ReturnType<typeof createServerClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createServerClient(cookies());
    return asPage<ProspectRow>(
      supabase
        .from("outreach_prospects")
        .select(PROSPECT_COLUMNS, opts)
        .eq("client_id", clientId)
        .eq("outreach_upload_id", uploadId)
        .order("id", { ascending: true })
        .range(from, to),
    );
  };
}

/**
 * One Client's snapshot headers, newest first.
 *
 * `null` on failure OR truncation — a partial upload history would misdate the
 * "tracked since" end of any trend built from it, and the same rule already
 * governs `listUploads` on the LinkedIn side.
 */
export async function listOutreachUploads(clientId: string): Promise<OutreachUpload[] | null> {
  const { rows, unavailable, truncated } = await readAllPages(
    uploadPageReader(clientId),
    "public.outreach_uploads",
  );
  if (unavailable || truncated) return null;
  return rows.map(toUpload);
}

/**
 * The Client's most recent snapshot: its header and every prospect row in it.
 *
 * ⚠️ THREE OUTCOMES, KEPT APART ON PURPOSE (see `LatestSnapshot`). "the read
 * broke", "this Client has never had an outreach upload", and "here is the
 * snapshot" license three different sentences on screen, and only the middle one
 * may render as an empty dashboard.
 *
 * ⚠️ A FAILED PROSPECT READ IS `unavailable`, NOT AN `ok` WITH NO ROWS. A
 * snapshot header whose rows cannot be read is not a snapshot of zero prospects;
 * returning `ok` with `[]` would put a fully zeroed funnel on screen under a
 * real upload date.
 *
 * ⚠️ TRUNCATION RETURNS THE ROWS AND SAYS SO — deliberately unlike
 * `listOutreachUploads` above, which nulls a truncated read. The difference is
 * what a caller can do about it: a partial funnel that DISCLOSES it is partial
 * is still worth showing beside `upload.rowCount` and `total`, whereas a partial
 * upload history has no honest rendering at all. What must never happen is a
 * short read that stays quiet, so `truncated` is not optional to check.
 */
export async function latestSnapshot(clientId: string): Promise<LatestSnapshot> {
  const headers = await readAllPages(uploadPageReader(clientId), "public.outreach_uploads");
  if (headers.unavailable) return { status: "unavailable" };

  // Newest-first, so the first header is the latest snapshot. Truncation cannot
  // hide it for the same reason: a cap drops the OLDEST rows.
  const newest = headers.rows[0];
  if (newest === undefined) return { status: "empty" };

  const { rows, unavailable, truncated, total } = await readAllPages(
    prospectPageReader(clientId, newest.id),
    "public.outreach_prospects",
  );
  if (unavailable) return { status: "unavailable" };

  return {
    status: "ok",
    upload: toUpload(newest),
    prospects: rows.map(toProspect),
    truncated,
    total,
  };
}

/**
 * ONE NAMED SNAPSHOT's prospects — the read that makes comparison possible.
 *
 * ⚠️ RECOMPUTED FROM RAW ROWS, DELIBERATELY, AND NOT READ FROM STORED COUNTS.
 * ADR 0009: values are stored exactly as they arrived and interpreted at read
 * time, so a corrected reading fixes every past snapshot at once. Freezing
 * per-snapshot counts into `outreach_uploads` at ingest would be cheaper and
 * would leave old snapshots asserting arithmetic the app no longer believes —
 * the reply vocabulary has already changed once, and every historical figure
 * moved with it, which is the behaviour we want.
 *
 * ⚠️ FILTERED BY CLIENT **AND** UPLOAD. The upload id arrives as a parameter, so
 * a read keyed on it alone would return another Client's prospects if one were
 * ever passed by mistake; the client filter makes that impossible rather than
 * unlikely. It also lets this share `prospectPageReader` with `latestSnapshot`,
 * so both reads page identically and cannot drift apart.
 */
export async function snapshotById(clientId: string, uploadId: string): Promise<NamedSnapshot> {
  const { rows, unavailable, truncated, total } = await readAllPages(
    prospectPageReader(clientId, uploadId),
    "public.outreach_prospects",
  );
  if (unavailable) return { status: "unavailable" };

  return { status: "ok", prospects: rows.map(toProspect), truncated, total };
}
