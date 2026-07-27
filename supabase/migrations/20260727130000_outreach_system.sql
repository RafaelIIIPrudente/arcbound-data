-- ArcBase OUTREACH SYSTEM — ADDITIVE ONLY. CLI migration twin of
-- supabase/outreach-system.sql (the two are kept byte-identical by
-- supabase/sql-sync.test.ts). The SQL-editor paste script is the working path;
-- this exists so `supabase db push` builds the same schema.
--
-- WHY: Arcbound runs a LinkedIn OUTREACH operation for its Clients, tracked in a
-- 24-column "Master Database" sheet re-exported whole each time. ArcBase stores
-- each export as one immutable SNAPSHOT attributed to a Client chosen by a human
-- at upload (ADR 0012). Current state is the latest snapshot; movement over time
-- is snapshot-over-snapshot, because the source carries no `Date Connected` or
-- `Date Replied` column from which movement could otherwise be derived.
--
-- This migration creates THREE new objects and touches nothing that exists:
--   • public.outreach_uploads    — one immutable row per snapshot upload
--   • public.outreach_prospects  — one row per prospect PER SNAPSHOT, all text
--   • public.ingest_outreach     — atomic snapshot write, SECURITY DEFINER
--
-- It DROPS/ALTERS NOTHING (ADR 0009). It does NOT touch
-- public.linkedin_posts_staging, public.clients, public.uploads,
-- public.post_attributes, public.ingest_metrics, or the bi.* views. The LinkedIn
-- pipeline is entirely unaffected by this file.

-- ============================================================================
-- 1. outreach_uploads (one immutable row per snapshot upload)
-- ============================================================================
--
-- The snapshot HEADER: who it belongs to, how big it was, who submitted it, and
-- when. `row_count` is recorded here rather than counted at read time so a
-- snapshot whose prospect rows are later unreadable can still say how many rows
-- it carried — "could not be read" and "was empty" stay different facts.

create table if not exists public.outreach_uploads (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id),
  row_count   int not null,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table public.outreach_uploads enable row level security;

-- Read-only to authenticated staff; rows are written ONLY by the SECURITY
-- DEFINER function below (whose owner bypasses RLS). Deliberately NO
-- insert/update/delete policies — this mirrors how public.uploads and
-- public.post_attributes are protected.
drop policy if exists outreach_uploads_select_authenticated on public.outreach_uploads;
create policy outreach_uploads_select_authenticated on public.outreach_uploads
  for select to authenticated using (true);

-- ============================================================================
-- 2. outreach_prospects (one row per prospect PER SNAPSHOT — every value raw)
-- ============================================================================
--
-- ⚠️ EVERY SOURCE COLUMN IS `text`, INCLUDING THE DATES AND THE COUNT. ADR 0009:
-- values are stored exactly as they arrive and are interpreted only at READ
-- time. `follow_up_count` looks numeric ("0", "1", "2") and `date_sent` looks
-- like a date, but typing them here would force this file to decide what an
-- unparseable value means, and the only honest answer — show it verbatim and
-- disclose it — lives in the read layer. The source already proves the point:
-- eight rows carry a date inside `reply_status` ("Replied 2026-07-13").
--
-- ⚠️ NO UNIQUE CONSTRAINT OR UNIQUE INDEX ON ANY SOURCE COLUMN. `linkedin_url`
-- yields 1,419 distinct values across 1,435 rows, and normalising collapses it
-- to 1,408 — the source contains GENUINE DUPLICATE PROSPECTS. A unique key on
-- `linkedin_url`, `full_name`, or any combination would reject real data. Every
-- snapshot re-stores every row by design; rows are never matched, merged, or
-- rewritten, which is precisely what makes the duplicate-key problem moot.
--
-- ⚠️ `row_index` IS 0-BASED and preserves the order of the source file, so a
-- snapshot can be replayed in export order without relying on `id`.

create table if not exists public.outreach_prospects (
  id                        bigint generated always as identity primary key,
  outreach_upload_id        uuid not null references public.outreach_uploads(id) on delete cascade,
  client_id                 uuid not null references public.clients(id),
  row_index                 int not null,
  full_name                 text,
  title                     text,
  company                   text,
  icp_seg                   text,
  why_they_fit              text,
  what_they_lack            text,
  what_arcbound_offers      text,
  matching_client_archetype text,
  linkedin_url              text,
  location                  text,
  source_citation           text,
  rationale                 text,
  linkedin_message          text,
  connection_status         text,
  date_sent                 text,
  reply_status              text,
  follow_up_count           text,
  last_follow_up_date       text,
  next_touch_date           text,
  meeting_booked_date       text,
  stage                     text,
  owner                     text,
  notes                     text,
  qualified_icp             text
);

alter table public.outreach_prospects enable row level security;

-- Same protection as the header table: staff may read, nobody may write except
-- the definer function.
drop policy if exists outreach_prospects_select_authenticated on public.outreach_prospects;
create policy outreach_prospects_select_authenticated on public.outreach_prospects
  for select to authenticated using (true);

-- The read path is always "this Client's rows from this snapshot" — the client
-- tab reads the latest snapshot, and the trend compares two of them.
create index if not exists outreach_prospects_client_upload_idx
  on public.outreach_prospects (client_id, outreach_upload_id);

-- ============================================================================
-- 3. ingest_outreach (atomic snapshot write)
-- ============================================================================
--
-- ALL-OR-NOTHING. A plpgsql function body is one transaction, so any raise below
-- rolls back the header row and every prospect row together. A snapshot is never
-- half-written, which matters because "1,435 rows" is recorded on the header and
-- a partial write would make that number a lie.
--
-- ⚠️ ATTRIBUTION IS THE PASSED `p_client_id`, AND NOTHING ELSE. No column of the
-- file is consulted to decide whose data this is — `owner` is stored raw and is
-- never read for attribution. This is the deliberate opposite of the downstream
-- name-match that ADR 0009 records as a mistake, and ADR 0012 makes it a rule.
--
-- ⚠️ VALUES ARE COPIED STRAIGHT OUT OF THE JSON WITH `->>`. No trimming, no
-- casing, no coercion, no null-for-blank rewriting — the parser has already
-- decided what is blank, and this function's job is storage, not judgement.
create or replace function public.ingest_outreach(
  p_client_id uuid,
  p_rows      jsonb
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

  insert into public.outreach_uploads (client_id, row_count, uploaded_by)
  values (p_client_id, v_row_count, auth.uid())
  returning id into v_upload_id;

  insert into public.outreach_prospects (
    outreach_upload_id, client_id, row_index,
    full_name, title, company, icp_seg, why_they_fit, what_they_lack,
    what_arcbound_offers, matching_client_archetype, linkedin_url, location,
    source_citation, rationale, linkedin_message, connection_status, date_sent,
    reply_status, follow_up_count, last_follow_up_date, next_touch_date,
    meeting_booked_date, stage, owner, notes, qualified_icp
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
    elem.value->>'qualified_icp'
  from jsonb_array_elements(p_rows) with ordinality as elem(value, ord);

  return jsonb_build_object(
    'upload_id', v_upload_id,
    'row_count', v_row_count
  );
end;
$$;

comment on function public.ingest_outreach(uuid, jsonb) is
  'Atomic Outreach SNAPSHOT write (ADR 0012): inserts one immutable public.outreach_uploads header row and every prospect row into public.outreach_prospects in a single transaction, preserving source order in a 0-based row_index. Each upload stores the WHOLE file again — rows are never matched, merged, deduplicated, or rewritten, so genuine duplicate prospects in the source survive and movement over time is computed by comparing snapshots. Every source column is stored as raw text (ADR 0009); canonicalisation happens at read time only. Attribution is the passed p_client_id and nothing else — no column of the file, including owner, is consulted. Returns {upload_id, row_count}. Rolls back the whole call on any bad input.';

revoke all     on function public.ingest_outreach(uuid, jsonb) from public;
grant  execute on function public.ingest_outreach(uuid, jsonb) to authenticated;
