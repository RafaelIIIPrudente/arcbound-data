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
  OutreachVoidResult,
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
  // ⚠️ ALL THREE NULLABLE, AND THE NULLS ARE REAL STATES. `uploaded_by` is null
  // whenever the write happened outside a user session; `voided_at is null` IS
  // the live state, with no boolean twin anywhere in the schema.
  uploaded_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
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
export const UPLOAD_COLUMNS =
  "id, client_id, row_count, created_at, has_email_channel, uploaded_by, voided_at, voided_by";

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
    // ⚠️ `?? null`, NEVER `?? ""` AND NEVER A DERIVED BOOLEAN. `voidedAt` stays
    // the timestamp it is: a computed `isVoided` here would be a second source
    // of truth for one fact. Callers that want a boolean write
    // `voidedAt !== null` where they need it.
    uploadedBy: row.uploaded_by ?? null,
    voidedAt: row.voided_at ?? null,
    voidedBy: row.voided_by ?? null,
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
 *
 * ⚠️ `includeVoided` IS REQUIRED, WITH NO DEFAULT, BECAUSE THE TWO CALLERS WANT
 * OPPOSITE THINGS. `listOutreachUploads` is the staff upload history and MUST
 * show voided rows — a reversible flag nobody can see is not reversible.
 * `latestSnapshot` is the dashboard and MUST skip them, or a voided snapshot
 * stays on screen as the Client's current position. A blanket filter here would
 * be wrong in one direction whichever way it pointed, and a DEFAULT would let
 * the next caller inherit whichever way this one happened to lean. Making it
 * required costs one argument and removes the whole class of mistake.
 */
function uploadPageReader(
  clientId: string,
  { includeVoided }: { includeVoided: boolean },
): PageReader<UploadRow> {
  let supabase: ReturnType<typeof createServerClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createServerClient(cookies());
    const query = supabase
      .from("outreach_uploads")
      .select(UPLOAD_COLUMNS, opts)
      .eq("client_id", clientId);
    // ⚠️ FILTERED IN THE QUERY, NOT AFTER THE READ. Truncation drops the OLDEST
    // rows, so a TypeScript filter applied to a capped page could report a
    // Client as having no live snapshot while one sat below the cap. Paging over
    // live rows only means the first row is the newest live snapshot wherever
    // the cap falls. `.is()` rather than `.eq()` because SQL null is not a value
    // `=` can match.
    const scoped = includeVoided ? query : query.is("voided_at", null);
    return asPage<UploadRow>(
      scoped
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
 *
 * ⚠️ VOIDED SNAPSHOTS ARE INCLUDED, DELIBERATELY. This is the staff history, and
 * Q3 says staff see the voids: a reversible flag nobody can see is not
 * reversible, and hiding voided rows here would leave a voided snapshot
 * indistinguishable from one that never existed. Each row carries `voidedAt`, so
 * a caller renders the distinction rather than inferring it from an absence.
 */
export async function listOutreachUploads(clientId: string): Promise<OutreachUpload[] | null> {
  const { rows, unavailable, truncated } = await readAllPages(
    uploadPageReader(clientId, { includeVoided: true }),
    "public.outreach_uploads",
  );
  if (unavailable || truncated) return null;
  return rows.map(toUpload);
}

/**
 * The Client's most recent snapshot: its header and every prospect row in it.
 *
 * ⚠️ FOUR OUTCOMES, KEPT APART ON PURPOSE (see `LatestSnapshot`). "the read
 * broke", "this Client has never had an outreach upload", "every snapshot they
 * had was voided", and "here is the snapshot" license four different sentences
 * on screen, and only the middle two may render without a dashboard.
 *
 * ⚠️ VOIDED SNAPSHOTS ARE SKIPPED — the opposite of `listOutreachUploads` above,
 * from the same reader, by explicit opt-out. A voided snapshot is not the
 * Client's current position; the next live one down is. When none remain this
 * returns `all-voided` rather than `empty`, because "nothing has been uploaded
 * for this client" is FALSE for someone whose colleague voided their upload an
 * hour ago — and false in the direction that invites re-uploading data that is
 * already there.
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
  const headers = await readAllPages(
    uploadPageReader(clientId, { includeVoided: false }),
    "public.outreach_uploads",
  );
  if (headers.unavailable) return { status: "unavailable" };

  // Newest-first, so the first header is the latest LIVE snapshot. Truncation
  // cannot hide it for the same reason: a cap drops the OLDEST rows.
  const newest = headers.rows[0];
  if (newest === undefined) return await noLiveSnapshot(clientId);

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
 * Which state a Client with NO LIVE SNAPSHOT is actually in.
 *
 * ⚠️ "NO LIVE SNAPSHOT" IS NOT YET AN ANSWER — it is two answers wearing one
 * face. A Client who never uploaded and a Client whose every snapshot was voided
 * both read as zero live rows, and they license opposite sentences: one invites
 * an upload, the other invites an un-void. Telling them apart needs a second
 * read, which is why this exists rather than a `?? empty` at the call site.
 *
 * ⚠️ IT COSTS A ROUND TRIP ONLY ON THIS BRANCH. Every Client with a live
 * snapshot — which is every Client in the ordinary case — returns above without
 * reaching here.
 *
 * ⚠️ A FAILED SECOND READ IS `unavailable`, NEVER `all-voided` AND NEVER
 * `empty`. If it breaks we know there is no live snapshot and nothing else, so
 * naming either state would assert something nothing measured.
 */
async function noLiveSnapshot(clientId: string): Promise<LatestSnapshot> {
  const all = await readAllPages(
    uploadPageReader(clientId, { includeVoided: true }),
    "public.outreach_uploads",
  );
  if (all.unavailable) return { status: "unavailable" };

  // No rows at all, voided or otherwise: this Client has genuinely never had an
  // outreach upload. `empty` keeps exactly the meaning it has always had.
  if (all.rows.length === 0) return { status: "empty" };

  // ⚠️ `total` FIRST — it is the database's own exact count and survives
  // truncation, whereas `rows.length` is a floor once the cap is hit. Falling
  // back to a truncated length would print a confident undercount; `null` says
  // "not known", which `LatestSnapshot` documents and the UI renders as no
  // figure at all rather than as zero.
  return {
    status: "all-voided",
    voidedCount: all.total ?? (all.truncated ? null : all.rows.length),
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

/**
 * The envelope both void RPCs return. Validated at the boundary, exactly as
 * `ingestSummarySchema` validates the ingest RPC's.
 *
 * ⚠️ `.nullable()` ON BOTH VOID FIELDS, NEVER `.optional()`. A missing key and a
 * key holding null are different answers: `unvoid` reports `voided_at: null`
 * deliberately — that IS the live state — whereas an absent key means the
 * function returned a shape this app does not understand, and should throw.
 */
const voidResultSchema = z.object({
  upload_id: z.string().min(1),
  client_id: z.string().min(1),
  voided_at: z.string().nullable(),
  voided_by: z.string().nullable(),
});

function toVoidResult(data: unknown): OutreachVoidResult {
  const parsed = voidResultSchema.parse(data);
  return {
    uploadId: parsed.upload_id,
    clientId: parsed.client_id,
    voidedAt: parsed.voided_at,
    voidedBy: parsed.voided_by,
  };
}

/**
 * Void one outreach snapshot, reversibly.
 *
 * ⚠️ THIS SEAM CARRIES NO PERMISSION LOGIC, AND MUST NEVER GROW ANY. The RPC is
 * SECURITY DEFINER and enforces `coalesce(uploaded_by = auth.uid(), false) or
 * public.is_admin()` inside its own body — that check IS the security boundary,
 * because RLS does not apply within a definer function. A copy of the rule here
 * would add no safety (the database refuses either way) while inviting the next
 * reader to believe the application is what protects the row. What the UI
 * computes decides what to SHOW; this decides nothing.
 *
 * ⚠️ A REFUSAL ARRIVES AS AN ERROR AND IS RETHROWN. 42501 must reach the caller
 * as a failure — swallowing it into a success would leave the list unchanged
 * beside a message saying it changed.
 *
 * Idempotent at the database: voiding an already-voided snapshot is a no-op that
 * returns the ORIGINAL void, not a fresh one.
 */
export async function voidOutreachUpload(uploadId: string): Promise<OutreachVoidResult> {
  const supabase = createServerClient(cookies());
  const { data, error } = await supabase.rpc("void_outreach_upload", { p_upload_id: uploadId });
  if (error) {
    throw new Error(`Void failed: ${error.message}`);
  }
  return toVoidResult(data);
}

/**
 * Restore a voided snapshot. The same rule, and the same non-role here: the
 * database decides, this reports.
 *
 * Idempotent: un-voiding a live snapshot is a no-op rather than an error.
 */
export async function unvoidOutreachUpload(uploadId: string): Promise<OutreachVoidResult> {
  const supabase = createServerClient(cookies());
  const { data, error } = await supabase.rpc("unvoid_outreach_upload", { p_upload_id: uploadId });
  if (error) {
    throw new Error(`Un-void failed: ${error.message}`);
  }
  return toVoidResult(data);
}
