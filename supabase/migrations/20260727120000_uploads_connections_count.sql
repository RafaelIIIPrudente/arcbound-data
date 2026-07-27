-- ArcBase CONNECTION COUNT — ADDITIVE ONLY. CLI migration twin of
-- supabase/uploads-connections-count.sql (the two are kept byte-identical by
-- supabase/sql-sync.test.ts). The SQL-editor paste script is the working path;
-- this exists so `supabase db push` builds the same schema.
--
-- WHY: a Client's LinkedIn CONNECTION count is captured with the same weekly
-- scrape as the follower count, so it belongs on the same per-Upload audit row —
-- a nullable integer beside `follower_count`, not a table, a dataset, or a
-- per-post fact.
--
-- OPTIONAL BY DESIGN, AND THAT IS WHY IT IS NULLABLE. A scrape may arrive
-- without a connection count and must still ingest; every upload written BEFORE
-- this column existed carries none, and there is no historical source to
-- backfill from. A missing value is therefore ABSENT — the app renders it as a
-- gap, never as 0, because "nobody wrote it down" and "this Client has zero
-- connections" are different facts.
--
-- This migration changes TWO things:
--   • public.uploads          — one new nullable column, connections_count
--   • public.ingest_metrics   — REPLACED: identical behaviour, one extra param
--                               (p_connections_count) written to that column
--
-- It DROPS/ALTERS NOTHING the analytics engineer owns (ADR 0009): it does NOT
-- touch public.linkedin_posts_staging, the public.clients shape, or the bi.*
-- views. public.uploads is app-owned.

-- ============================================================================
-- 1. uploads.connections_count (new — nullable, never defaulted)
-- ============================================================================
--
-- NO DEFAULT AND NO BACKFILL, deliberately. `default 0` would rewrite every
-- historical upload as a measured zero, which is exactly the collapse the rest
-- of this codebase spends its comments preventing.

alter table public.uploads add column if not exists connections_count int;

comment on column public.uploads.connections_count is
  'The Client''s total LinkedIn connection count at the time of this scrape. NULLABLE and OPTIONAL: a scrape may carry no connection count, and every upload written before this column existed carries none. NULL means NOT RECORDED — it is never a measured zero, and the app renders it as a gap rather than 0. Parallel to follower_count; written only by ingest_metrics.';

-- ============================================================================
-- 2. ingest_metrics (REPLACED — new (uuid, text, jsonb, int, int) signature)
-- ============================================================================
--
-- ⚠️ THE DROP IS LOAD-BEARING. Postgres keys a function by its argument types,
-- so `create or replace` with an extra parameter creates a SECOND, OVERLOADED
-- function rather than replacing the first. The old 4-argument version would
-- survive, keep its grant, and stay callable — writing uploads rows with no
-- connections column forever. It is dropped first so exactly one ingest_metrics
-- exists.
--
-- Everything below is IDENTICAL to 20260722120000_post_attributes.sql — the same
-- validation, the same constraint-free staging upsert, the same
-- inserted/updated/unchanged tally, the same post_attributes record, the same
-- all-or-nothing rollback. The ONLY changes are the new `p_connections_count`
-- parameter (placed after p_follower_count, mirroring where the value sits on
-- the form) and the extra column in the uploads insert.

drop function if exists public.ingest_metrics(uuid, text, jsonb, int);

create or replace function public.ingest_metrics(
  p_client_id         uuid,
  p_source_type       text,
  p_rows              jsonb,
  p_follower_count    int,
  p_connections_count int
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

  -- ⚠️ p_connections_count IS DELIBERATELY UNVALIDATED FOR PRESENCE. It is
  -- OPTIONAL: null is a legitimate value meaning "this scrape carried none", and
  -- raising on it would break the very case this column was added to support.

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

    -- Record this post's asset type alongside the staging write, in the SAME
    -- transaction. Written RAW, exactly as received — no re-casing, trimming, or
    -- normalising (ADR 0009). Runs on both the insert and the update path.
    insert into public.post_attributes (linkedin_post_id, post_format_type, recorded_at)
    values (v_post_id, v_elem->>'post_format_type', now())
    on conflict (linkedin_post_id) do update set
      post_format_type = excluded.post_format_type,
      recorded_at      = excluded.recorded_at;
  end loop;

  -- One immutable audit row per successful ingest. `connections_count` is stored
  -- exactly as handed over, INCLUDING null — an absent count is recorded as
  -- absent, never coerced to 0.
  insert into public.uploads (
    client_id, source_type, rows_inserted, rows_updated, rows_unchanged,
    follower_count, connections_count, uploaded_by
  ) values (
    p_client_id, p_source_type, v_inserted, v_updated, v_unchanged,
    p_follower_count, p_connections_count, auth.uid()
  );

  return jsonb_build_object(
    'inserted',  v_inserted,
    'updated',   v_updated,
    'unchanged', v_unchanged
  );
end;
$$;

comment on function public.ingest_metrics(uuid, text, jsonb, int, int) is
  'Atomic ingest into the externally-owned public.linkedin_posts_staging (constraint-free upsert on linkedin_post_id, raw text), tallies inserted/updated/unchanged, writes one immutable public.uploads row carrying the scrape''s follower_count and OPTIONAL connections_count (null when the scrape carried none — never 0), records each post''s raw post_format_type into the app-owned public.post_attributes, and returns the summary. Rolls back the whole call on any bad row (invariant #4). Attribution is the downstream name-match in bi.linkedin_post_latest.';

revoke all     on function public.ingest_metrics(uuid, text, jsonb, int, int) from public;
grant  execute on function public.ingest_metrics(uuid, text, jsonb, int, int) to authenticated;
