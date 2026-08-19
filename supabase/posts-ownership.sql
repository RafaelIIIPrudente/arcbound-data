-- ArcBase POSTS OWNERSHIP (ADR 0010, slice S1) — copy-paste for the Supabase SQL
-- editor (Dashboard → SQL Editor → New query → paste → Run). Same DDL as
-- supabase/migrations/20260819120000_posts_ownership.sql. Runbook:
-- supabase/POSTS-OWNERSHIP-APPLY.md. Plan: D4/D5/D6 in
-- docs/specs/2026-08-19-analytics-ownership-execution.md.
--
-- ⚠️ APPLY supabase/writers-registry.sql AND supabase/drop-staff-directory.sql
-- FIRST. Both are still outstanding at the time this was written and both sort
-- before this pair. Nothing here depends on them, but adding a table this central
-- to a database in a half-known state is how a bad afternoon starts.
--
-- ⚠️ RUN THE VERIFICATION QUERIES IN THE RUNBOOK ONE AT A TIME. The Supabase SQL
-- editor renders ONLY the LAST statement's result set, so a check that returned
-- nothing looks exactly like a check you never ran.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
--
-- ArcBase has been the FEED of an externally-owned pipeline (ADR 0009): it writes
-- all-text rows into public.linkedin_posts_staging and reads analytics back from
-- Shay's bi.* views, which type the columns, resolve the relative dates, derive
-- `interactions`, and attribute each post to a Client by an EXACT, CASE-SENSITIVE
-- NAME MATCH. On 2026-08-18 that match silently dropped all fourteen of a
-- Client's posts because his Premium scrape rendered his name twice.
--
-- This script gives ArcBase its own typed table whose attribution is a real
-- foreign key, stamped from the client the operator picked at upload.
--
-- ⚠️ IT CHANGES NOTHING ANYONE READS. The staging write stays BYTE-FOR-BYTE what
-- it is today, bi.* keeps serving every screen, and public.posts is populated but
-- queried by nothing. That is what makes this slice safe to sit in indefinitely:
-- undoing it means ceasing to use a table nobody reads. Repointing the reads is
-- S2 and is a separate, later pair.
--
-- ⚠️ IT DROPS NOTHING. No view, no table, no function belonging to anyone else is
-- touched. public.linkedin_posts_staging is not altered, and no column, key or
-- constraint is added to it.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. Guarded conversion helpers — where "unreadable" becomes NULL, never 0
-- ============================================================================
--
-- ⚠️ THE ENTIRE ADR RESTS ON THESE TWO FUNCTIONS. Staging is all-text: every
-- column can hold '', 'n/a', or anything else a scrape produced. A plain
-- `::bigint` cast would ABORT the backfill on the first bad value; a
-- `coalesce(...,0)` would quietly turn "we could not read this" into a measured
-- zero, and every downstream average, delta and "0 saves" would then be
-- unfalsifiable. These return NULL and let the four states stay four.

create or replace function public.arcbase_num(p_text text)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Thousands separators are tolerated because a pre-ArcBase writer may have left
  -- them; anything else that is not a plain number becomes NULL rather than 0.
  select case
           when p_text is null then null
           when btrim(replace(p_text, ',', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
             then btrim(replace(p_text, ',', ''))::numeric
           else null
         end;
$$;

comment on function public.arcbase_num(text) is
  'Text to numeric, or NULL when the text is not a plain number. NEVER 0 — an unreadable measurement and a measured zero are different facts, and collapsing them is the defect ADR 0010 exists to prevent.';

create or replace function public.arcbase_ts(p_text text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return p_text::timestamptz;
exception when others then
  -- A malformed timestamp is "we do not know when", not an ingest failure. One
  -- bad scraped_at must not roll back an otherwise good weekly upload.
  return null;
end;
$$;

comment on function public.arcbase_ts(text) is
  'Text to timestamptz, or NULL when it cannot be parsed. Never raises: an unparseable timestamp is an unknown time, not a reason to reject an entire upload.';

-- ============================================================================
-- 2. public.posts — app-owned, typed, attributed by foreign key
-- ============================================================================
--
-- ⚠️ EVERY METRIC COLUMN IS NULLABLE, AND NOT ONE HAS A DEFAULT. A
-- `not null default 0` anywhere below is precisely the defect this ADR exists to
-- prevent: it would make "nobody could read this number" and "this number is
-- zero" the same row forever, with no way to tell them apart afterwards.

create table if not exists public.posts (
  -- The unique key staging never had. Staging has no primary key and no unique
  -- constraint, which is why its upsert is a SELECT-then-UPDATE that can only
  -- guess. Here `on conflict` is real.
  linkedin_post_id           text primary key,

  -- ⚠️ ATTRIBUTION IS THIS COLUMN, AND NOTHING ELSE. It is stamped at ingest from
  -- the Client the operator selected on the upload form — information ArcBase has
  -- always had and, until now, discarded in favour of matching a scraped author
  -- string. NO ACTION on delete, deliberately: `set null` would silently unassign
  -- a Client's whole post history the moment somebody removed a Client row.
  client_id                  uuid not null references public.clients(id),

  post_url                   text,
  analytics_url              text,

  -- Provenance, not attribution. The raw scraped author label is kept so a
  -- mis-attributed row can still be traced back to what the scrape actually said,
  -- and so the upload-time wrong-file warning has something to compare against.
  post_name                  text,
  post_content               text,

  -- ⚠️ RAW IS NEVER REWRITTEN. `post_age` is the scrape's own relative text
  -- ("4d", "1w", "23h") kept exactly as received; `estimated_post_date` is what
  -- ArcBase resolved it to, and is NULL whenever no date can be established.
  -- Keeping both means a resolver change can be re-run against the original.
  post_age                   text,
  estimated_post_date        timestamptz,

  impressions                bigint,
  likes                      bigint,
  comments                   bigint,
  reposts                    bigint,
  saves                      bigint,

  -- Derived: likes + comments + reposts, NULL if ANY of the three is NULL.
  -- Saves are NOT a term — the scrape's own engagement_rate reconciles exactly
  -- against (likes+comments+reposts)/impressions on every sample in this repo.
  interactions               bigint,

  -- The scrape's own rate, stored underived, so Data Quality can keep
  -- reconciling the two against each other and show where they disagree.
  provided_engagement_rate   numeric,
  -- Derived: interactions / impressions * 100. NULL when impressions is NULL or
  -- ZERO — zero impressions is a real measurement that makes the rate undefined,
  -- and a fabricated 0% would drag every average that touches it.
  calculated_engagement_rate numeric,

  -- Folded in from day one so S3 needs no second backfill. public.post_attributes
  -- keeps working untouched until then.
  post_format_type           text,

  scraped_at                 timestamptz,
  uploaded_at                timestamptz not null default now(),
  uploaded_by                uuid references auth.users(id)
);

comment on table public.posts is
  'ArcBase-owned LinkedIn post metrics (ADR 0010). Typed, with attribution as a real client_id foreign key stamped at ingest from the operator''s selection — never a downstream name match. Every metric column is NULLABLE: NULL means the value could not be read and is never a measured zero. Written only through public.ingest_metrics and the one-time public.backfill_posts_from_staging().';

comment on column public.posts.client_id is
  'The Client this post belongs to. Authoritative, stamped at upload from the operator''s own selection. This column replaces the exact-string name match in bi.linkedin_post_latest that silently dropped a Client''s entire post history on 2026-08-18.';

comment on column public.posts.estimated_post_date is
  'Resolved publish instant, or NULL when none can be established. NULL for hour- and minute-grained ages ON PURPOSE: dating them lands every fresh post on the scrape''s own weekday and fabricates a rhythm in a client-facing chart. Resolved in TypeScript by src/lib/post-date.ts, never in SQL.';

comment on column public.posts.interactions is
  'likes + comments + reposts. NULL if ANY component is NULL — a partial sum presented as a total is the same lie as a null presented as a zero. Saves are deliberately excluded.';

alter table public.posts enable row level security;

-- Readable by any authenticated staff member; written ONLY through the SECURITY
-- DEFINER functions below (the definer owner bypasses RLS). There is no insert,
-- update or delete policy, so there is no route by which a session token can
-- write here directly — the same shape public.writers and public.industries use.
drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts
  for select to authenticated using (true);

-- Every read this table will serve in S2 is "one Client's posts, newest first".
create index if not exists posts_client_id_idx on public.posts (client_id);
create index if not exists posts_client_date_idx
  on public.posts (client_id, estimated_post_date desc nulls last);

-- ============================================================================
-- 3. ingest_metrics — REPLACED, same (uuid, text, jsonb, int, int) signature
-- ============================================================================
--
-- ⚠️ THE SIGNATURE IS UNCHANGED ON PURPOSE, so `create or replace` REPLACES the
-- live function rather than overloading it. The previous pair had to `drop` first
-- precisely because it added a parameter; this one must not, and src/services/
-- ingest.ts calls it with exactly the same five arguments as before.
--
-- ⚠️ EVERYTHING THAT EXISTED STILL HAPPENS, UNCHANGED:
--   • the constraint-free all-text upsert into public.linkedin_posts_staging
--   • the inserted/updated/unchanged tally, still computed FROM STAGING
--   • the one immutable public.uploads audit row
--   • the raw public.post_attributes record
--   • all-or-nothing rollback on any bad row
--
-- ⚠️ THE TALLY STILL COUNTS STAGING ROWS, NOT posts ROWS, AND THAT IS DELIBERATE.
-- "3 new, 1 updated" is a user-visible number on the upload result screen. If it
-- started counting a different table mid-cutover, two releases would report
-- different summaries for the same file and neither would be wrong.
--
-- THE ONLY ADDITION is the upsert into public.posts, which stamps p_client_id.
-- The typed values arrive already typed and already date-resolved from
-- src/services/ingest.ts (the `n_*` keys) — no date arithmetic happens here,
-- because a resolver in plpgsql could not be unit-tested.

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

    -- ── THE APP-OWNED WRITE (ADR 0010) ──────────────────────────────────────
    -- Same transaction, same loop, same array element — so a row can never land
    -- in one store and miss the other.
    --
    -- ⚠️ client_id IS OVERWRITTEN ON CONFLICT. If the same post is re-uploaded
    -- under a different Client, the operator's most recent selection wins. That
    -- is the whole premise: the person choosing from the dropdown is the
    -- authority on whose post this is.
    --
    -- ⚠️ THE `n_*` VALUES ARE ALREADY TYPED AND ALREADY DATE-RESOLVED by
    -- src/services/ingest.ts. `->>` yields SQL NULL for a JSON null, so the
    -- four-state discipline crosses the boundary intact. arcbase_num guards
    -- against anything else arriving as text.
    insert into public.posts (
      linkedin_post_id, client_id, post_url, analytics_url, post_name, post_content,
      post_age, estimated_post_date, impressions, likes, comments, reposts, saves,
      interactions, provided_engagement_rate, calculated_engagement_rate,
      post_format_type, scraped_at, uploaded_at, uploaded_by
    ) values (
      v_post_id,
      p_client_id,
      v_elem->>'post_url',
      v_elem->>'analytics_url',
      v_elem->>'post_name',
      v_elem->>'post_content',
      v_elem->>'post_date',
      public.arcbase_ts(v_elem->>'n_estimated_post_date'),
      public.arcbase_num(v_elem->>'n_impressions')::bigint,
      public.arcbase_num(v_elem->>'n_likes')::bigint,
      public.arcbase_num(v_elem->>'n_comments')::bigint,
      public.arcbase_num(v_elem->>'n_reposts')::bigint,
      public.arcbase_num(v_elem->>'n_saves')::bigint,
      public.arcbase_num(v_elem->>'n_interactions')::bigint,
      public.arcbase_num(v_elem->>'n_provided_rate'),
      public.arcbase_num(v_elem->>'n_calculated_rate'),
      v_elem->>'post_format_type',
      public.arcbase_ts(v_elem->>'scraped_at'),
      now(),
      auth.uid()
    )
    on conflict (linkedin_post_id) do update set
      client_id                  = excluded.client_id,
      post_url                   = excluded.post_url,
      analytics_url              = excluded.analytics_url,
      post_name                  = excluded.post_name,
      post_content               = excluded.post_content,
      post_age                   = excluded.post_age,
      estimated_post_date        = excluded.estimated_post_date,
      impressions                = excluded.impressions,
      likes                      = excluded.likes,
      comments                   = excluded.comments,
      reposts                    = excluded.reposts,
      saves                      = excluded.saves,
      interactions               = excluded.interactions,
      provided_engagement_rate   = excluded.provided_engagement_rate,
      calculated_engagement_rate = excluded.calculated_engagement_rate,
      post_format_type           = excluded.post_format_type,
      scraped_at                 = excluded.scraped_at,
      uploaded_at                = excluded.uploaded_at,
      uploaded_by                = excluded.uploaded_by;
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
  'Atomic DUAL-WRITE ingest (ADR 0010 S1). Writes the raw all-text row into the externally-owned public.linkedin_posts_staging exactly as before, AND upserts a typed row into the app-owned public.posts attributed by p_client_id — the Client the operator selected — rather than by a downstream name match. Also writes the immutable public.uploads audit row (with the optional connections_count, null when absent, never 0) and the raw public.post_attributes record. The inserted/updated/unchanged tally is still computed FROM STAGING so the upload summary keeps meaning the same thing across the cutover. Typed values arrive pre-resolved from src/services/ingest.ts; unreadable metrics are NULL, never 0. Rolls back the whole call on any bad row.';

revoke all     on function public.ingest_metrics(uuid, text, jsonb, int, int) from public;
grant  execute on function public.ingest_metrics(uuid, text, jsonb, int, int) to authenticated;

-- ============================================================================
-- 4. backfill_posts_from_staging() — one-time, idempotent, and it COUNTS
-- ============================================================================
--
-- ⚠️ THIS IS THE LAST LEGITIMATE USE OF THE NAME MATCH IN THIS CODEBASE. History
-- has no client_id — staging never had the column — so the only way to attribute
-- the rows already in the database is the very expression bi.linkedin_post_latest
-- uses. It is reproduced VERBATIM so that day one shows no analytics regression:
-- whatever bi.* attributed, this attributes identically, including its mistakes.
--
-- ⚠️ UNMATCHED ROWS ARE SKIPPED AND COUNTED, NEVER SILENTLY DROPPED. They were
-- invisible before too; the difference is that afterwards we know how many there
-- are. The fourteen posts lost on 2026-08-18 are exactly this population, and the
-- returned count is the first time anyone can see its size.
--
-- ⚠️ estimated_post_date IS COPIED FROM bi.linkedin_post_latest, NOT RECOMPUTED.
-- ArcBase's resolver lives in TypeScript so it can be unit-tested (D5); writing a
-- second copy of it in plpgsql purely for the backfill would create two resolvers
-- that must agree forever and cannot be tested together. Copying makes history
-- identical to what the reports show today BY CONSTRUCTION. New uploads use the
-- TypeScript resolver; only history is copied, and only once.
--
-- ⚠️ interactions IS COMPUTED BY ARCBASE'S RULE, NOT COPIED — and the disagreement
-- with the view's own column is COUNTED and returned. Nobody has ever been able to
-- read bi.linkedin_post_latest's definition of `interactions`, so this is the
-- measurement that settles it. A non-zero `interactions_differs_from_bi` means the
-- view counts something ArcBase does not (saves being the obvious candidate) and
-- MUST be resolved before S2 repoints the reads.

create or replace function public.backfill_posts_from_staging()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted           int := 0;
  v_updated            int := 0;
  v_skipped_unmatched  int := 0;
  v_skipped_no_id      int := 0;
  v_interactions_diff  int := 0;
begin
  -- Rows that carry no usable id can be neither keyed nor upserted. Counted so
  -- the total always adds up against `select count(*) from staging`.
  select count(*) into v_skipped_no_id
    from public.linkedin_posts_staging s
   where s.linkedin_post_id is null or btrim(s.linkedin_post_id) = '';

  -- ⚠️ DEDUPE THE WAY THE VIEW DOES: LATEST SCRAPE WINS. Staging has no unique
  -- key, so it can legitimately hold several rows for one post.
  --
  -- Ordered by `uploaded_at` because it is the only REAL timestamp column on the
  -- table — the ingest RPC sets it to now() on every write, insert or update — and
  -- because `scraped_at` is stored as TEXT there, so ordering by it sorts
  -- lexically and would put an unparseable or differently-formatted value in an
  -- arbitrary place. `scraped_at` is kept as the tie-break for rows written in the
  -- same transaction, where it is the only thing that distinguishes them.
  drop table if exists arcbase_bf_latest;
  create temp table arcbase_bf_latest on commit drop as
    select distinct on (s.linkedin_post_id) s.*
      from public.linkedin_posts_staging s
     where s.linkedin_post_id is not null
       and btrim(s.linkedin_post_id) <> ''
     order by s.linkedin_post_id,
              s.uploaded_at desc nulls last,
              s.scraped_at  desc nulls last;

  select count(*) into v_skipped_unmatched
    from arcbase_bf_latest l
   where not exists (
     select 1 from public.clients c
      where c.name = trim(regexp_replace(l.post_name, '\s*•\s*You\s*$', '', 'i'))
   );

  with prepared as (
    select
      l.linkedin_post_id,
      c.id                                   as client_id,
      l.post_url,
      l.analytics_url,
      l.post_name,
      l.post_content,
      l.post_date                            as post_age,
      b.estimated_post_date,
      n.impressions,
      n.likes,
      n.comments,
      n.reposts,
      n.saves,
      d.interactions,
      n.provided_rate,
      case
        when d.interactions is null or n.impressions is null or n.impressions = 0
          then null
        else (d.interactions / n.impressions) * 100
      end                                    as calculated_rate,
      coalesce(pa.post_format_type, l.post_format_type) as post_format_type,
      public.arcbase_ts(l.scraped_at)        as scraped_at,
      b.interactions                         as bi_interactions
    from arcbase_bf_latest l
    -- VERBATIM the join bi.linkedin_post_latest performs. Exact, case-sensitive,
    -- stripping one trailing " • You" and nothing else.
    join public.clients c
      on c.name = trim(regexp_replace(l.post_name, '\s*•\s*You\s*$', '', 'i'))
    left join bi.linkedin_post_latest b
      on b.linkedin_post_id = l.linkedin_post_id
    left join public.post_attributes pa
      on pa.linkedin_post_id = l.linkedin_post_id
    cross join lateral (
      select public.arcbase_num(l.impressions)     as impressions,
             public.arcbase_num(l.likes)           as likes,
             public.arcbase_num(l.comments)        as comments,
             public.arcbase_num(l.reposts)         as reposts,
             public.arcbase_num(l.saves)           as saves,
             public.arcbase_num(l.engagement_rate) as provided_rate
    ) n
    cross join lateral (
      -- NULL if ANY component is NULL. Never a partial sum.
      select case
               when n.likes is null or n.comments is null or n.reposts is null
                 then null
               else n.likes + n.comments + n.reposts
             end as interactions
    ) d
  ),
  upserted as (
    insert into public.posts (
      linkedin_post_id, client_id, post_url, analytics_url, post_name, post_content,
      post_age, estimated_post_date, impressions, likes, comments, reposts, saves,
      interactions, provided_engagement_rate, calculated_engagement_rate,
      post_format_type, scraped_at, uploaded_by
    )
    select
      p.linkedin_post_id, p.client_id, p.post_url, p.analytics_url, p.post_name,
      p.post_content, p.post_age, p.estimated_post_date,
      p.impressions::bigint, p.likes::bigint, p.comments::bigint,
      p.reposts::bigint, p.saves::bigint, p.interactions::bigint,
      p.provided_rate, p.calculated_rate, p.post_format_type, p.scraped_at,
      -- Historical rows were not uploaded by whoever runs the backfill.
      null::uuid
    from prepared p
    -- Idempotent: re-running refreshes the same rows rather than duplicating or
    -- double-counting them. `uploaded_at` is intentionally NOT touched on update,
    -- so a re-run does not rewrite when the row first arrived.
    on conflict (linkedin_post_id) do update set
      client_id                  = excluded.client_id,
      post_url                   = excluded.post_url,
      analytics_url              = excluded.analytics_url,
      post_name                  = excluded.post_name,
      post_content               = excluded.post_content,
      post_age                   = excluded.post_age,
      estimated_post_date        = excluded.estimated_post_date,
      impressions                = excluded.impressions,
      likes                      = excluded.likes,
      comments                   = excluded.comments,
      reposts                    = excluded.reposts,
      saves                      = excluded.saves,
      interactions               = excluded.interactions,
      provided_engagement_rate   = excluded.provided_engagement_rate,
      calculated_engagement_rate = excluded.calculated_engagement_rate,
      post_format_type           = excluded.post_format_type,
      scraped_at                 = excluded.scraped_at
    returning (xmax = 0) as was_insert
  )
  select
    count(*) filter (where was_insert),
    count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  -- The measurement that settles what bi.* means by `interactions`. Both sides
  -- must be present for a comparison to mean anything; a row the view does not
  -- carry is not a disagreement.
  select count(*) into v_interactions_diff
    from public.posts p
    join bi.linkedin_post_latest b using (linkedin_post_id)
   where p.interactions is not null
     and b.interactions is not null
     and p.interactions <> b.interactions;

  return jsonb_build_object(
    'inserted',                   v_inserted,
    'updated',                    v_updated,
    'skipped_unmatched',          v_skipped_unmatched,
    'skipped_no_id',              v_skipped_no_id,
    'interactions_differs_from_bi', v_interactions_diff
  );
end;
$$;

comment on function public.backfill_posts_from_staging() is
  'One-time, idempotent historical load of public.linkedin_posts_staging into public.posts (ADR 0010 D6). Deduplicates latest-scrape-wins, attributes by the SAME exact name match bi.linkedin_post_latest uses — the last legitimate use of it — copies estimated_post_date from that view so history matches what the reports already show, and derives interactions by ArcBase''s own rule. Returns {inserted, updated, skipped_unmatched, skipped_no_id, interactions_differs_from_bi}. Unmatched rows are skipped and COUNTED, never silently dropped.';

-- ⚠️ NOT GRANTED TO `authenticated`, DELIBERATELY. No screen calls this and none
-- should: it is a one-time administrative load run by staff in the SQL editor,
-- where it executes as the owner. Leaving it ungranted means no session token can
-- reach it at all.
revoke all on function public.backfill_posts_from_staging() from public;

-- ============================================================================
-- 5. Tell PostgREST the schema moved
-- ============================================================================

notify pgrst, 'reload schema';

-- ============================================================================
-- 6. ⚠️ FINAL STATEMENT — the one result the SQL editor will actually show you
-- ============================================================================
--
-- The backfill is NOT run by this script. Run it yourself, as its own query,
-- after reading the runbook's pre-flight count:  select public.backfill_posts_from_staging();

select
  (select count(*) from public.posts)                       as posts_rows,
  (select count(*) from public.linkedin_posts_staging)      as staging_rows,
  (select count(*) from pg_policy
    where polrelid = 'public.posts'::regclass)              as posts_policies,
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('arcbase_num','arcbase_ts',
                      'ingest_metrics','backfill_posts_from_staging'))
                                                            as functions_present;
