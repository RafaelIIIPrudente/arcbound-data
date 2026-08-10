-- ArcBase OUTREACH SYSTEM — EMAIL CHANNEL — ADDITIVE ONLY. CLI migration twin of
-- supabase/outreach-email-channel.sql (the two are kept byte-identical by
-- supabase/sql-sync.test.ts). The SQL-editor paste script is the working path; this
-- exists so `supabase db push` builds the same schema.
--
-- WHY: the "Master Database" export grew from 24 to 39 columns — 15 new `Email — *`
-- columns tracking a second outreach channel alongside LinkedIn (see
-- docs/decisions/2026-08-03-outreach-email-channel.md, D1–D7). This migration:
--   • ADDS the 15 new source columns to public.outreach_prospects, all text, all
--     nullable — the same "every value raw, interpreted at read time" rule the
--     original 24 already follow (ADR 0009).
--   • ADDS public.outreach_uploads.has_email_channel, recording whether THIS upload's
--     file carried the email block, so a pre-change snapshot can render its Email
--     funnel as "not in this export" rather than a false zero (D3).
--   • REPLACES public.ingest_outreach with a three-argument version that writes both.
--
-- It DROPS/ALTERS NOTHING ELSE (ADR 0009). It does NOT touch
-- public.linkedin_posts_staging, public.clients, public.uploads,
-- public.post_attributes, public.ingest_metrics, the bi.* views, or
-- public.report_link_read. The LinkedIn pipeline and the public Report Link path are
-- entirely unaffected by this file.

-- ============================================================================
-- 1. outreach_prospects — 15 new source columns
-- ============================================================================
--
-- ⚠️ ALL 15 ARE `text`, ALL NULLABLE, SAME RULE AS THE ORIGINAL 24. Several look
-- like dates or a count ("Email — Follow-up Count", "Email — Date Emailed"), and
-- the temptation to type them here is the same one the original columns already
-- resisted (see the ⚠️ above them below) — the source is exactly as dirty on this
-- side: `Email — Reply Status` embeds booking dates inside free text, and
-- `Email — Status` and `Email — Stage` overlap rather than being independent axes.
-- Interpretation stays a read-time decision.

alter table public.outreach_prospects
  add column if not exists email_best_email          text,
  add column if not exists email_mobile               text,
  add column if not exists email_subject_line         text,
  add column if not exists email_message               text,
  add column if not exists email_status                text,
  add column if not exists email_date_emailed          text,
  add column if not exists email_reply_status          text,
  add column if not exists email_follow_up_count       text,
  add column if not exists email_last_follow_up_date   text,
  add column if not exists email_next_touch_date       text,
  add column if not exists email_webinar_registered    text,
  add column if not exists email_meeting_booked_date   text,
  add column if not exists email_stage                 text,
  add column if not exists email_owner                 text,
  add column if not exists email_notes                 text;

-- ============================================================================
-- 2. outreach_uploads — has_email_channel
-- ============================================================================
--
-- ⚠️ `default false` IS THE CORRECT BACKFILL AND NOT A CONVENIENCE. Every snapshot
-- already stored genuinely did not carry the email block — the export was 24
-- columns wide when those rows were written — so `false` is the true historical
-- value for every existing row, not a placeholder standing in for "unknown". Going
-- forward, `ingest_outreach` below stamps the real value on every new upload.

alter table public.outreach_uploads
  add column if not exists has_email_channel boolean not null default false;

-- ============================================================================
-- 3. ingest_outreach — three-argument replacement
-- ============================================================================
--
-- ⚠️ POSTGRES OVERLOADS BY SIGNATURE. `create or replace function` with a new
-- argument list would create a SECOND function alongside the two-argument one
-- rather than replacing it, and PostgREST could then resolve either — so the old
-- signature is dropped explicitly before the new one is created.

drop function if exists public.ingest_outreach(uuid, jsonb);

-- ALL-OR-NOTHING, unchanged from the original: a plpgsql function body is one
-- transaction, so any raise below rolls back the header row and every prospect row
-- together.
--
-- ⚠️ ATTRIBUTION IS THE PASSED `p_client_id`, AND NOTHING ELSE — unchanged.
--
-- ⚠️ VALUES ARE COPIED STRAIGHT OUT OF THE JSON WITH `->>`, INCLUDING THE 15 NEW
-- ONES. No trimming, no casing, no coercion, no null-for-blank rewriting — the
-- parser has already decided what is blank, and this function's job is storage,
-- not judgement.
--
-- ⚠️ `p_has_email_channel` DEFAULTS TO `false`, AND THAT DEFAULT IS THE CORRECT
-- VALUE FOR A TWO-ARGUMENT CALLER, NOT A DEFENSIVE FALLBACK. Without it, the SQL
-- and code deploys are not atomic in either order: applying this script first
-- leaves the still-running old build sending two arguments to a function that no
-- longer exists, and deploying the new build first sends three arguments to a
-- database that only has the two-argument function — either order breaks every
-- outreach upload until the other side catches up. With the default, a
-- two-argument call resolves to THIS function, and `false` is not a guess about
-- it: anything still sending two arguments is necessarily the OLD build, whose
-- parser accepts only the 24-column export, so that upload genuinely carried no
-- email block. The new build always passes `true` explicitly.
--
-- ⚠️ THE DEFAULT DOES NOT MAKE THE `drop function` ABOVE UNNECESSARY — KEEP IT.
-- The two-argument function still exists in a live database until this script
-- runs, and Postgres resolves a call to an EXACT signature match when one
-- exists, before it considers a default. An un-dropped two-argument function
-- would keep catching every two-argument call itself — a call that appears to
-- work while never touching `has_email_channel` at all, because it never reaches
-- this function's body. The drop is what forces every caller onto this one.
create or replace function public.ingest_outreach(
  p_client_id          uuid,
  p_rows               jsonb,
  p_has_email_channel  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
  v_row_count int;
begin
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '22004';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count = 0 then
    raise exception 'p_rows must not be empty' using errcode = '22023';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'unknown client_id %', p_client_id using errcode = '23503';
  end if;

  insert into public.outreach_uploads (client_id, row_count, uploaded_by, has_email_channel)
  values (p_client_id, v_row_count, auth.uid(), p_has_email_channel)
  returning id into v_upload_id;

  insert into public.outreach_prospects (
    outreach_upload_id, client_id, row_index,
    full_name, title, company, icp_seg, why_they_fit, what_they_lack,
    what_arcbound_offers, matching_client_archetype, linkedin_url, location,
    source_citation, rationale, linkedin_message, connection_status, date_sent,
    reply_status, follow_up_count, last_follow_up_date, next_touch_date,
    meeting_booked_date, stage, owner, notes, qualified_icp,
    email_best_email, email_mobile, email_subject_line, email_message,
    email_status, email_date_emailed, email_reply_status, email_follow_up_count,
    email_last_follow_up_date, email_next_touch_date, email_webinar_registered,
    email_meeting_booked_date, email_stage, email_owner, email_notes
  )
  select
    v_upload_id,
    p_client_id,
    (elem.ord - 1)::int,
    elem.value->>'full_name',
    elem.value->>'title',
    elem.value->>'company',
    elem.value->>'icp_seg',
    elem.value->>'why_they_fit',
    elem.value->>'what_they_lack',
    elem.value->>'what_arcbound_offers',
    elem.value->>'matching_client_archetype',
    elem.value->>'linkedin_url',
    elem.value->>'location',
    elem.value->>'source_citation',
    elem.value->>'rationale',
    elem.value->>'linkedin_message',
    elem.value->>'connection_status',
    elem.value->>'date_sent',
    elem.value->>'reply_status',
    elem.value->>'follow_up_count',
    elem.value->>'last_follow_up_date',
    elem.value->>'next_touch_date',
    elem.value->>'meeting_booked_date',
    elem.value->>'stage',
    elem.value->>'owner',
    elem.value->>'notes',
    elem.value->>'qualified_icp',
    elem.value->>'email_best_email',
    elem.value->>'email_mobile',
    elem.value->>'email_subject_line',
    elem.value->>'email_message',
    elem.value->>'email_status',
    elem.value->>'email_date_emailed',
    elem.value->>'email_reply_status',
    elem.value->>'email_follow_up_count',
    elem.value->>'email_last_follow_up_date',
    elem.value->>'email_next_touch_date',
    elem.value->>'email_webinar_registered',
    elem.value->>'email_meeting_booked_date',
    elem.value->>'email_stage',
    elem.value->>'email_owner',
    elem.value->>'email_notes'
  from jsonb_array_elements(p_rows) with ordinality as elem(value, ord);

  return jsonb_build_object(
    'upload_id', v_upload_id,
    'row_count', v_row_count
  );
end;
$$;

comment on function public.ingest_outreach(uuid, jsonb, boolean) is
  'Atomic Outreach SNAPSHOT write (ADR 0012): inserts one immutable public.outreach_uploads header row and every prospect row into public.outreach_prospects in a single transaction, preserving source order in a 0-based row_index. Each upload stores the WHOLE file again — rows are never matched, merged, deduplicated, or rewritten, so genuine duplicate prospects in the source survive and movement over time is computed by comparing snapshots. Every source column is stored as raw text (ADR 0009); canonicalisation happens at read time only. Attribution is the passed p_client_id and nothing else — no column of the file, including owner, is consulted. p_has_email_channel records whether THIS export carried the 15 Email — * columns (D3): stamped onto outreach_uploads.has_email_channel so a snapshot taken before the email channel existed renders its Email funnel as "not in this export" rather than a false zero. Returns {upload_id, row_count}. Rolls back the whole call on any bad input.';

revoke all     on function public.ingest_outreach(uuid, jsonb, boolean) from public;
grant  execute on function public.ingest_outreach(uuid, jsonb, boolean) to authenticated;
