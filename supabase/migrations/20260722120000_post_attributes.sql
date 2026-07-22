-- ArcBase post ATTRIBUTES — ADDITIVE ONLY. Conforms to the externally-owned BI
-- schema (ADR 0009); nothing here is owned by the analytics engineer.
--
-- WHY: `bi.linkedin_post_latest` exposes seventeen columns and
-- `post_format_type` is NOT among them, and that view is out of scope to change.
-- But ArcBase already knows each post's format — its own upload review gate
-- resolves it — so it records the format in an app-owned table and joins it to
-- the BI rows at read time.
--
-- This migration creates ONE new object and REPLACES one existing function:
--   • public.post_attributes            — app-owned per-post facts (format type)
--   • public.ingest_metrics             — REPLACED: unchanged behaviour + one
--                                         extra write into post_attributes
--   • public.backfill_post_attributes   — one-time repair for older posts
--
-- It DROPS/ALTERS NOTHING that the analytics engineer owns. In particular it
-- does NOT touch `public.linkedin_posts_staging` (no column, constraint, or
-- index is added to it), the `public.clients` shape, or the `bi.*` views. The
-- backfill function SELECTs from staging and never writes to it.

-- ============================================================================
-- 1. post_attributes (app-owned — per-post facts the BI view doesn't expose)
-- ============================================================================

create table if not exists public.post_attributes (
  -- Matches linkedin_posts_staging.linkedin_post_id (all-text staging). No FK:
  -- staging has no unique key and we must not add one (ADR 0009).
  linkedin_post_id text primary key,
  -- The format EXACTLY as the Scrape sent it — never re-cased, trimmed, or
  -- normalised. Mixed-case variants of one format are therefore possible;
  -- anything that GROUPS by asset type must canonicalise first.
  post_format_type text,
  recorded_at      timestamptz not null default now()
);

alter table public.post_attributes enable row level security;

-- Read-only to authenticated staff; rows are written ONLY by the SECURITY
-- DEFINER functions below (whose owner bypasses RLS). Deliberately NO
-- insert/update/delete policies — this mirrors how public.uploads is protected.
drop policy if exists post_attributes_select_authenticated on public.post_attributes;
create policy post_attributes_select_authenticated on public.post_attributes
  for select to authenticated using (true);

-- ============================================================================
-- 2. ingest_metrics (REPLACED — behaviour unchanged, plus the format record)
-- ============================================================================
--
-- Identical to 20260716120000_arcbase_ingest_write.sql in signature, tally
-- logic, uploads audit row, and all-or-nothing rollback. The ONLY addition is
-- the post_attributes upsert inside the row loop: because it runs in the SAME
-- transaction, a format record can never drift from its staging row, and a
-- failed ingest rolls back both.
create or replace function public.ingest_metrics(
  p_client_id      uuid,
  p_source_type    text,
  p_rows           jsonb,
  p_follower_count int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem        jsonb;
  v_post_id     text;
  v_found       boolean;
  v_changed     boolean;
  v_inserted    int := 0;
  v_updated     int := 0;
  v_unchanged   int := 0;
  -- previous metric strings (all-text staging) for the changed/unchanged tally
  v_old_impr    text;
  v_old_likes   text;
  v_old_comm    text;
  v_old_reposts text;
  v_old_eng     text;
  v_old_saves   text;
begin
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '22004';
  end if;
  if p_source_type is null or p_source_type not in ('csv','json') then
    raise exception 'p_source_type must be csv or json' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'unknown client_id %', p_client_id using errcode = '23503';
  end if;

  for v_elem in select value from jsonb_array_elements(p_rows) as arr(value)
  loop
    v_post_id := v_elem->>'linkedin_post_id';
    if v_post_id is null or btrim(v_post_id) = '' then
      raise exception 'row is missing linkedin_post_id' using errcode = '22023';
    end if;

    -- No unique key on staging → match by equality, take one for the tally.
    select impressions, likes, comments, reposts, engagement_rate, saves
      into v_old_impr, v_old_likes, v_old_comm, v_old_reposts, v_old_eng, v_old_saves
      from public.linkedin_posts_staging
      where linkedin_post_id = v_post_id
      limit 1;
    v_found := found;

    if not v_found then
      insert into public.linkedin_posts_staging (
        linkedin_post_id, urn, post_url, analytics_url, post_name, post_content,
        post_date, impressions, likes, comments, reposts, engagement_rate, saves,
        post_format_type, scraped_at, uploaded_at
      ) values (
        v_post_id, v_elem->>'urn', v_elem->>'post_url', v_elem->>'analytics_url',
        v_elem->>'post_name', v_elem->>'post_content', v_elem->>'post_date',
        v_elem->>'impressions', v_elem->>'likes', v_elem->>'comments',
        v_elem->>'reposts', v_elem->>'engagement_rate', v_elem->>'saves',
        v_elem->>'post_format_type', v_elem->>'scraped_at', now()
      );
      v_inserted := v_inserted + 1;
    else
      -- Metric strings differ → updated; identical → unchanged (matches the seam).
      v_changed := v_old_impr    is distinct from v_elem->>'impressions'
                or v_old_likes   is distinct from v_elem->>'likes'
                or v_old_comm    is distinct from v_elem->>'comments'
                or v_old_reposts is distinct from v_elem->>'reposts'
                or v_old_eng     is distinct from v_elem->>'engagement_rate'
                or v_old_saves   is distinct from v_elem->>'saves';

      -- Always refresh the stored row + uploaded_at (a re-upload is still a write).
      update public.linkedin_posts_staging set
        urn              = v_elem->>'urn',
        post_url         = v_elem->>'post_url',
        analytics_url    = v_elem->>'analytics_url',
        post_name        = v_elem->>'post_name',
        post_content     = v_elem->>'post_content',
        post_date        = v_elem->>'post_date',
        impressions      = v_elem->>'impressions',
        likes            = v_elem->>'likes',
        comments         = v_elem->>'comments',
        reposts          = v_elem->>'reposts',
        engagement_rate  = v_elem->>'engagement_rate',
        saves            = v_elem->>'saves',
        post_format_type = v_elem->>'post_format_type',
        scraped_at       = v_elem->>'scraped_at',
        uploaded_at      = now()
      where linkedin_post_id = v_post_id;

      if v_changed then
        v_updated := v_updated + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
    end if;

    -- ── THE ONLY ADDITION ────────────────────────────────────────────────────
    -- Record this post's asset type alongside the staging write, in the SAME
    -- transaction. Written RAW, exactly as received — no re-casing, trimming, or
    -- normalising (ADR 0009). Runs on both the insert and the update path.
    insert into public.post_attributes (linkedin_post_id, post_format_type, recorded_at)
    values (v_post_id, v_elem->>'post_format_type', now())
    on conflict (linkedin_post_id) do update set
      post_format_type = excluded.post_format_type,
      recorded_at      = excluded.recorded_at;
  end loop;

  -- One immutable audit row per successful ingest.
  insert into public.uploads (
    client_id, source_type, rows_inserted, rows_updated, rows_unchanged,
    follower_count, uploaded_by
  ) values (
    p_client_id, p_source_type, v_inserted, v_updated, v_unchanged,
    p_follower_count, auth.uid()
  );

  return jsonb_build_object(
    'inserted',  v_inserted,
    'updated',   v_updated,
    'unchanged', v_unchanged
  );
end;
$$;

comment on function public.ingest_metrics(uuid, text, jsonb, int) is
  'Atomic ingest into the externally-owned public.linkedin_posts_staging (constraint-free upsert on linkedin_post_id, raw text), tallies inserted/updated/unchanged, writes one immutable public.uploads row, records each post''s raw post_format_type into the app-owned public.post_attributes, and returns the summary. Rolls back the whole call on any bad row (invariant #4). Attribution is the downstream name-match in bi.linkedin_post_latest.';

revoke all     on function public.ingest_metrics(uuid, text, jsonb, int) from public;
grant  execute on function public.ingest_metrics(uuid, text, jsonb, int) to authenticated;

-- ============================================================================
-- 3. backfill_post_attributes (one-time repair; safe to re-run)
-- ============================================================================
--
-- Posts ingested BEFORE post_attributes existed have no format record, so both
-- asset-type report pages would show them as unknown. This copies the format
-- already sitting in staging into post_attributes.
--
-- READ-ONLY with respect to staging: it SELECTs and nothing more — no insert,
-- update, delete, or alter (ADR 0009).
--
-- IDEMPOTENT: `on conflict do nothing` means a second run changes nothing and
-- reports 0. It also means an existing record is never clobbered — a row
-- written by ingest_metrics is authoritative and fresher than staging.
--
-- Staging has NO unique key on linkedin_post_id, so the same id can appear more
-- than once; `distinct on` collapses those to the most recently uploaded row.
-- Without it the statement would fail ("cannot affect row a second time").
create or replace function public.backfill_post_attributes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backfilled int := 0;
begin
  insert into public.post_attributes (linkedin_post_id, post_format_type, recorded_at)
  select distinct on (s.linkedin_post_id)
         s.linkedin_post_id,
         s.post_format_type,
         now()
    from public.linkedin_posts_staging s
   where s.linkedin_post_id is not null
     and btrim(s.linkedin_post_id) <> ''
     and s.post_format_type is not null
     and btrim(s.post_format_type) <> ''
   order by s.linkedin_post_id, s.uploaded_at desc nulls last
  on conflict (linkedin_post_id) do nothing;

  get diagnostics v_backfilled = row_count;

  return jsonb_build_object('backfilled', v_backfilled);
end;
$$;

comment on function public.backfill_post_attributes() is
  'One-time repair: copies raw post_format_type from public.linkedin_posts_staging into the app-owned public.post_attributes for posts ingested before that table existed. READ-ONLY against staging. Idempotent and safe to re-run — existing records are left untouched (on conflict do nothing), so a second run reports {backfilled: 0}. Run once after applying this migration, or historical posts report an unknown asset type.';

revoke all     on function public.backfill_post_attributes() from public;
grant  execute on function public.backfill_post_attributes() to authenticated;
