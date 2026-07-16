-- ArcBase ingest WRITE side — ADDITIVE ONLY. Conforms to the externally-owned BI
-- schema (ADR 0009, supersedes the withdrawn ADR 0008).
--
-- This migration creates ONLY two app-owned objects:
--   • public.uploads       — an immutable per-ingest audit table
--   • public.ingest_metrics — the atomic upsert RPC into the EXISTING staging table
--
-- It DROPS/ALTERS NOTHING that the analytics engineer owns. In particular it does
-- NOT touch `public.linkedin_posts_staging` (all-text, no PK/unique, no client_id),
-- the `public.clients` shape, or the `bi.*` views. It adds NO unique constraint,
-- `client_id`, or column to staging — attribution is the downstream NAME MATCH in
-- `bi.linkedin_post_latest` (clients.name ≈ cleaned post_name).
--
-- Guardrails: immutability — no update/delete policy on uploads (invariant #2);
-- all-or-nothing ingest — the RPC is one transaction; a bad row rolls back the
-- whole call (invariant #4).

-- ============================================================================
-- 1. uploads (app-owned immutable audit — one row per successful ingest)
-- ============================================================================

create table if not exists public.uploads (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id),
  source_type    text not null check (source_type in ('csv','json')),
  rows_inserted  int not null,
  rows_updated   int not null,
  rows_unchanged int not null,
  follower_count int,
  uploaded_by    uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists uploads_client_id_idx on public.uploads (client_id);

alter table public.uploads enable row level security;

-- Read-only to authenticated staff; rows are written ONLY by ingest_metrics
-- (SECURITY DEFINER, owner bypasses RLS). No insert/update/delete policies.
drop policy if exists uploads_select_authenticated on public.uploads;
create policy uploads_select_authenticated on public.uploads
  for select to authenticated using (true);

-- ============================================================================
-- 2. ingest_metrics RPC (atomic; SECURITY DEFINER; writes RAW text to staging)
-- ============================================================================
--
-- Constraint-free upsert on linkedin_post_id (staging has no unique key, and we
-- must not add one): SELECT the existing metrics, then UPDATE-if-present /
-- INSERT-if-absent. Everything is written as raw text exactly as received —
-- Shay's `bi.*` views do all cleaning/typing/date-resolution/name-matching.
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
  'Atomic ingest into the externally-owned public.linkedin_posts_staging (constraint-free upsert on linkedin_post_id, raw text), tallies inserted/updated/unchanged, writes one immutable public.uploads row, returns the summary. Rolls back the whole call on any bad row (invariant #4). Attribution is the downstream name-match in bi.linkedin_post_latest.';

revoke all     on function public.ingest_metrics(uuid, text, jsonb, int) from public;
grant  execute on function public.ingest_metrics(uuid, text, jsonb, int) to authenticated;
