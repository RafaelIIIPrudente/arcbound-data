-- ArcBase POSTS AS SOLE SOURCE (ADR 0010, slice S3) — copy-paste for the Supabase
-- SQL editor (Dashboard → SQL Editor → New query → paste → Run). Same DDL as
-- supabase/migrations/20260821120000_posts_sole_source.sql. Runbook:
-- supabase/POSTS-SOLE-SOURCE-APPLY.md.
--
-- ⚠️ APPLY supabase/posts-ownership.sql AND supabase/posts-read-view.sql FIRST,
-- AND RUN THE BACKFILL. This pair assumes `public.posts` exists and is populated
-- and that `public.client_posts` exists.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ THIS IS THE POINT OF NO RETURN, AND IT IS THE ONLY THING IN THIS FILE THAT
-- CANNOT BE UNDONE BY A CODE REVERT.
--
-- Up to now the rollback was four lines of TypeScript: `bi.*` was still being fed
-- by every upload, so reverting put the app back on a CORRECT old source. From
-- the moment this pair applies, `public.linkedin_posts_staging` stops being
-- written — so `bi.linkedin_post_latest` starts going stale immediately, and
-- reverting the application after the next upload yields a report that is
-- silently MISSING every post uploaded since. Silently: no error, no banner, just
-- a smaller number.
--
-- Read supabase/POSTS-SOLE-SOURCE-APPLY.md before running this.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES, IN THREE PARTS
--
-- A. ⚠️ `report_link_read` — THE CLIENT-FACING READ, AND THE REASON THIS SLICE
--    EXISTS. It is the SECURITY DEFINER function behind /r/[token], the report a
--    Client downloads, and it reads `bi.linkedin_post_latest` in plpgsql. Slice
--    S2's acceptance criterion was `grep '.schema("bi")' src/` returning nothing.
--    That grep passed, and was true, and could not see this: a TypeScript grep
--    cannot see a read written in SQL. Deploying S2 without this leaves staff
--    reading FK-attributed data while Clients read name-matched data, with the
--    wrong one in the Client's hands.
--
-- B. `ingest_metrics` stops dual-writing. `public.posts` becomes the only store
--    an upload touches.
--
-- C. `public.client_posts` carries `post_format_type`, so the reporting layer
--    stops issuing a second read for it.
--
-- ⚠️ IT DROPS NOTHING. `bi.linkedin_post_latest`, `public.linkedin_posts_staging`,
-- `public.post_attributes` and `public.backfill_posts_from_staging()` all remain,
-- unwritten and unread. Retiring the objects is a separate, separately-confirmed
-- step that should not happen until ArcBase has run on `public.posts` for a week.

-- ============================================================================
-- 1. public.client_posts — now carrying post_format_type (Part C)
-- ============================================================================
--
-- ⚠️ `security_invoker = true` IS RESTATED, NOT INHERITED. `create or replace
-- view` REPLACES the options list; omitting it here would silently drop the
-- setting the previous pair set, and the view would begin running with its
-- OWNER's rights and bypassing the RLS policy on `public.posts`. Single-tenant
-- makes the outcome identical today, which is exactly why nobody would notice.
--
-- Every other column is unchanged from supabase/posts-read-view.sql, which is
-- APPLIED and is therefore never edited — this is the later pair that supersedes
-- it, exactly as the repo's rule requires.

create or replace view public.client_posts
with (security_invoker = true)
as
select
  p.client_id                                        as client_id,
  c.name                                             as client_name,
  p.linkedin_post_id                                 as linkedin_post_id,
  p.post_url                                         as post_url,
  p.post_content                                     as post_content,
  p.post_age                                         as post_age,
  p.estimated_post_date                              as estimated_post_date,
  p.impressions::bigint                              as impressions,
  p.likes::bigint                                    as likes,
  p.comments::bigint                                 as comments,
  p.reposts::bigint                                  as reposts,
  p.saves::bigint                                    as saves,
  p.interactions::bigint                             as interactions,
  p.provided_engagement_rate::double precision       as provided_engagement_rate,
  p.calculated_engagement_rate::double precision     as calculated_engagement_rate,
  p.scraped_at                                       as scraped_at,
  p.uploaded_at                                      as uploaded_at,
  -- ⚠️ NEW, AND IT MUST BE LAST. `create or replace view` can only APPEND
  -- columns — every existing column has to keep its name, type AND POSITION.
  -- Adding this one in its "natural" place beside the other post fields makes
  -- Postgres read position 16 as a RENAME and refuse the whole statement:
  --   ERROR: 42P16: cannot change name of view column "scraped_at"
  --                 to "post_format_type"
  -- (observed on 2026-08-19 applying exactly that.) The alternative is dropping
  -- and recreating the view, which this pair will not do: it opens a window with
  -- no view at all and silently discards the grants.
  --
  -- ⚠️ COLUMN ORDER IS NOT PART OF THE CONTRACT, so appending costs nothing.
  -- Every consumer addresses columns BY NAME — `POST_COLUMNS` is a named select
  -- list, `to_jsonb(p)` in report_link_read emits an object keyed by name, and
  -- `BiPostRow` is a TypeScript interface. Nothing here reads a column by index.
  --
  -- Raw, exactly as the Scrape sent it and as the upload review settled it —
  -- "DOCUMENT", "document" and " Document " are three distinct strings here and
  -- one format in the report. ⚠️ CANONICALISE BEFORE GROUPING (toCanonicalFormat);
  -- an unrecognised or absent value is UNKNOWN, which is a real member of the
  -- vocabulary rather than an error.
  p.post_format_type                                 as post_format_type
from public.posts p
join public.clients c on c.id = p.client_id;

comment on view public.client_posts is
  'App-owned read projection of public.posts in the exact shape ArcBase''s BiPostRow consumes (ADR 0010). Replaces bi.linkedin_post_latest as the read surface for BOTH the staff app and the client-facing report_link_read. A STRAIGHT PROJECTION ONLY — no dedup, no date resolution, no name matching. Carries post_format_type from S3 so no second read is needed for it. security_invoker so the RLS policy on public.posts still applies.';

revoke all on public.client_posts from public;
grant select on public.client_posts to authenticated;

-- ============================================================================
-- 2. report_link_read — the CLIENT-FACING read (Part A)
-- ============================================================================
--
-- ⚠️ FOURTH REDEFINITION, AND THE LIVE ONE WAS NOT WHERE IT LOOKED. In order:
-- report-links.sql -> outreach-report-link.sql -> outreach-email-report-link.sql
-- -> outreach-void.sql (20260814120000), which is the definition this supersedes.
-- The first three are DEAD FILES; editing one changes nothing. This body was
-- copied from the live one mechanically, so every guard below is byte-identical.
--
-- ⚠️ EVERY GUARD IS PRESERVED, AND THE FAILURE MODE HERE IS A DATA LEAK ON A
-- PUBLIC URL RATHER THAN A WRONG NUMBER:
--   • token must exist and not be revoked                  (`revoked_at is null`)
--   • an unexpired grant must hash-match  (second factor to the DATA, not the page)
--   • ANY failure returns null — never a distinguishing error, so the endpoint is
--     not an oracle for which tokens exist
--   • outreach is AGGREGATE-ONLY (ADR 0012): no prospect row, name, URL, message,
--     note or stage ever crosses this boundary
--   • the voided-snapshot predicate, the id tie-break, and the combined-meetings
--     union all survive untouched
--
-- ⚠️ ONLY TWO THINGS CHANGED: `posts` reads public.client_posts instead of
-- bi.linkedin_post_latest, and `attributes` is projected from the row instead of
-- read from the app-owned attributes table. See the note at that key for why it
-- is still emitted at all.
create or replace function public.report_link_read(p_token text, p_grant text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link        public.report_links%rowtype;
  v_client      uuid;
  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  -- Whether THIS snapshot's upload carried the 15 Email — * columns (D3, D9) —
  -- the flag that lets a pre-S1 snapshot render "not in this export" rather
  -- than a false zero, exactly as it does on the staff tab.
  v_has_email_channel boolean;
  v_outreach    jsonb;
begin
  select * into v_link
    from public.report_links
    where token = p_token and revoked_at is null;
  if not found then
    return null;
  end if;

  -- The grant is the SECOND factor to the DATA. No matching unexpired grant → no
  -- rows, regardless of a valid token (hashed compare; the grant is 128-bit).
  if not exists (
    select 1 from public.report_link_grants g
    where g.link_id = v_link.id
      and g.grant_hash = encode(digest(p_grant, 'sha256'), 'hex')
      and g.expires_at > now()
  ) then
    return null;
  end if;

  v_client := v_link.client_id;

  -- ── The outreach aggregate (ADR 0012): now NINE numbers, one flag, one
  --    timestamp ─────────────────────────────────────────────────────────
  --
  -- The Client's CURRENT position, which is the most recent snapshot for them.
  --
  -- ⚠️ THE `id` TIE-BREAK IS NOT DECORATION. Two uploads inside the same second
  -- would otherwise resolve arbitrarily, and the Client's figures could change
  -- between two page loads with no upload having happened in between.
  --
  -- ⚠️ NEW (2026-08-14) — `voided_at is null` IS THE WHOLE CLIENT-FACING VOID.
  -- A voided snapshot is not the Client's current position; the next live one
  -- down is, and if there is none the branch below leaves `outreach` jsonb
  -- null. This predicate is the only reason a staff void reaches /r/[token] at
  -- all — without it the void would be honoured in TypeScript and ignored on
  -- the one surface the Client actually reads.
  select ou.id, ou.created_at, ou.has_email_channel
    into v_snapshot_id, v_snapshot_at, v_has_email_channel
    from public.outreach_uploads ou
    where ou.client_id = v_client
      and ou.voided_at is null
    order by ou.created_at desc, ou.id desc
    limit 1;

  -- ⚠️ NO SNAPSHOT ⇒ THE KEY STAYS jsonb null, NOT AN OBJECT OF ZEROS. "This
  -- Client has no outreach uploaded" and "this Client's outreach shows zero" are
  -- different sentences and only one of them is ever true.
  --
  -- ⚠️ THESE PREDICATES ARE A SECOND IMPLEMENTATION OF THE FUNNEL RULES IN
  -- `buildOutreachAnalytics` AND `buildEmailAnalytics`
  -- (src/services/outreach-analytics.ts, src/services/email-analytics.ts).
  -- THEY CANNOT BE DEDUPLICATED — computing the client figure in TypeScript
  -- would mean shipping prospect rows out of the database, which is exactly
  -- what ADR 0012 forbids — so a change HERE must be made THERE, and vice
  -- versa, or the Client's report will quietly disagree with the staff
  -- Outreach tab. A test in src/services/outreach-analytics.test.ts pins each
  -- predicate against its TypeScript twin; it fails loudly if either side is
  -- edited alone.
  --
  -- The `replied`/`email_replied` rules are the subtle ones, and they mirror
  -- `canonicalReply`: a BLANK status is NOT a reply (nobody wrote anything
  -- down) while an UNRECOGNISED one IS (somebody answered and we do not know
  -- what they meant). Simplifying either to `<> 'no reply'` would count every
  -- blank cell as an answer, at the narrowest and most-scrutinised end of each
  -- funnel.
  --
  -- ⚠️ KNOWN, DELIBERATE DIVERGENCE — MEASURED, NOT SPECULATIVE. `canonicalReply`
  -- (src/lib/outreach-vocab.ts) strips a trailing parenthetical qualifier AND a
  -- hand-typed trailing ISO date before matching (S2, D6); this SQL matches
  -- only `<> 'no reply'` on the near-raw value (case-folded, whitespace-
  -- collapsed). A value like `No reply (bounced)` would therefore count as a
  -- REPLY here and as NO REPLY in TypeScript, on EITHER channel. The planner
  -- measured the current export on 2026-08-10: ZERO rows diverge today, on
  -- either `reply_status` or `email_reply_status` — every dated or qualified
  -- value observed already reads a sentiment word, never bare "no reply" with a
  -- trailing note. Do NOT "fix" this by porting the strip into SQL: mirroring
  -- the EXISTING shape keeps this predicate and the LinkedIn one it was copied
  -- from consistent with each other, and a real divergence would first need a
  -- value shaped like `No reply (...)` or `No reply YYYY-MM-DD` to exist at
  -- all. If one ever appears, add the same two strips here, to the LinkedIn
  -- predicate above, and to both mirroring tests in one change.
  --
  -- ⚠️ `combined_meetings` IS A UNION OVER BOTH MEETING COLUMNS, COMPUTED AS ONE
  -- FIGURE (D1, D8) — NEVER THE SUM OF `meetings_booked` AND
  -- `email_meetings_booked`. 8 prospects in the observed export carry a booked
  -- meeting in BOTH columns, so adding the two would overstate the true union
  -- by exactly those 8 (27 where the truth is 19). The `or` below counts each
  -- PERSON once, however many channels booked them.
  if v_snapshot_id is not null then
    select jsonb_build_object(
      'snapshot_at', v_snapshot_at,
      'total_prospects', count(*),
      'sent', count(*) filter (where op.date_sent is not null and btrim(op.date_sent) <> ''),
      'connected', count(*) filter (where lower(btrim(op.connection_status)) = 'connected'),
      'replied', count(*) filter (
        where op.reply_status is not null
          and btrim(op.reply_status) <> ''
          and lower(regexp_replace(btrim(op.reply_status), '\s+', ' ', 'g')) <> 'no reply'
      ),
      'meetings_booked', count(*) filter (where op.meeting_booked_date is not null and btrim(op.meeting_booked_date) <> ''),
      'has_email_channel', v_has_email_channel,
      'email_sent', count(*) filter (where op.email_date_emailed is not null and btrim(op.email_date_emailed) <> ''),
      'email_replied', count(*) filter (
        where op.email_reply_status is not null
          and btrim(op.email_reply_status) <> ''
          and lower(regexp_replace(btrim(op.email_reply_status), '\s+', ' ', 'g')) <> 'no reply'
      ),
      'email_meetings_booked', count(*) filter (where op.email_meeting_booked_date is not null and btrim(op.email_meeting_booked_date) <> ''),
      'combined_meetings', count(*) filter (
        where (op.meeting_booked_date is not null and btrim(op.meeting_booked_date) <> '')
           or (op.email_meeting_booked_date is not null and btrim(op.email_meeting_booked_date) <> '')
      )
    )
    into v_outreach
    from public.outreach_prospects op
    where op.outreach_upload_id = v_snapshot_id;
  end if;

  -- One entitled subject only: every sub-select is scoped to v_client. Empty
  -- arrays (a client with no posts) are a valid bundle, distinct from null (denied).
  return jsonb_build_object(
    'client_id', v_client,
    'client_name', (select c.name from public.clients c where c.id = v_client),
    'posts', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from public.client_posts p
      where p.client_id = v_client
    ),
    'uploads', (
      select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at), '[]'::jsonb)
      from public.uploads u
      where u.client_id = v_client
    ),
    -- ⚠️ THIS KEY IS DELIBERATELY STILL EMITTED, and it no longer reads the
    -- app-owned attributes TABLE. It is projected from the row's own
    -- post_format_type so that BOTH DEPLOY ORDERS ARE SAFE:
    --
    --   SQL first, app after  -> the OLD app reads `attributes[]`, builds its
    --                           format map, and renders correct formats.
    --   App first, SQL after  -> the NEW app finds no `post_format_type` on the
    --                           row, falls back to `attributes[]` from the OLD
    --                           function, and renders correct formats.
    --
    -- Dropping the key here would make the first order render EVERY post as
    -- UNKNOWN format on a document a Client downloads, for as long as the deploy
    -- window lasts -- visibly wrong, client-facing, and silent. The key retires
    -- with the table itself, in the drop step, once no deployed app reads it.
    --
    -- `recorded_at` is the row's `uploaded_at`: when ArcBase recorded this
    -- format, which is what that column always meant.
    'attributes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'linkedin_post_id', p.linkedin_post_id,
        'post_format_type', p.post_format_type,
        'recorded_at',      p.uploaded_at
      )), '[]'::jsonb)
      from public.client_posts p
      where p.client_id = v_client
    ),
    'outreach', v_outreach
  );
end;
$$;

comment on function public.report_link_read(text, text) is
  'Token + unexpired-grant gated single-client read for /r/[token] (ADR 0011/0012). Returns null on ANY failure so the endpoint is never an oracle. Reads posts from the app-owned public.client_posts (ADR 0010 S3 — it read bi.linkedin_post_latest until then, which is the read a TypeScript grep could not see). Outreach is AGGREGATE-ONLY: nine numbers, one flag, one timestamp, and never a prospect row. The attributes key is now projected from the row''s own post_format_type and is retained only so both deploy orders render correct formats.';

revoke all     on function public.report_link_read(text, text) from public;
grant  execute on function public.report_link_read(text, text) to anon, authenticated;

-- ============================================================================
-- 3. ingest_metrics — writes public.posts and NOTHING else (Part B)
-- ============================================================================
--
-- ⚠️ SAME (uuid, text, jsonb, int, int) SIGNATURE, so this REPLACES rather than
-- overloads and src/services/ingest.ts calls it unchanged.
--
-- GONE: the all-text upsert into public.linkedin_posts_staging, and the write to
-- public.post_attributes. Both tables remain; nothing writes them from here on.
--
-- KEPT: the validation, the one immutable public.uploads audit row (including the
-- OPTIONAL connections_count, null when absent and never 0), and the
-- all-or-nothing rollback on any bad row.
--
-- ⚠️ THE TALLY HAS NO STAGING LEFT TO COUNT, AND ITS MEANING HAS THEREFORE MOVED.
-- It is a USER-VISIBLE number on the upload result screen, so the change is worth
-- stating precisely:
--
--   inserted  — the upsert INSERTED. Read from `xmax = 0` on the RETURNING clause,
--               which is what the database actually did, not what we predicted.
--   unchanged — the row existed and EVERY value being written is NOT DISTINCT FROM
--               the value already stored.
--   updated   — the row existed and at least one value differs.
--
-- ⚠️ THE SAME FILE CAN NOW TALLY DIFFERENTLY THAN IT DID, IN FOUR WAYS. None is a
-- bug; all follow from comparing typed values instead of raw strings:
--   1. TYPED, NOT TEXTUAL. "1,959" and "1959" were two different strings and are
--      one bigint — a re-upload that only reformatted a number now reads UNCHANGED
--      where it used to read UPDATED.
--   2. WIDER. The old comparison looked at six metric strings only. This looks at
--      every column being written, so a file where only `post_content` changed now
--      reads UPDATED where it used to read UNCHANGED.
--   3. ATTRIBUTION COUNTS. Re-uploading a post under a DIFFERENT Client changes
--      client_id, which is a real change and now reads UPDATED.
--   4. NULL IS NOT ZERO HERE EITHER. `is not distinct from` treats two NULLs as
--      equal, so an unreadable value that stays unreadable is UNCHANGED rather
--      than being compared as `null = null` and silently falling through to
--      UPDATED.

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
  v_old         public.posts%rowtype;
  v_found       boolean;
  v_is_insert   boolean;
  v_same        boolean;
  v_inserted    int := 0;
  v_updated     int := 0;
  v_unchanged   int := 0;
  -- The typed values for THIS row, computed once and used three times: for the
  -- comparison, for the insert and for the update. Computing them twice is how
  -- the comparison and the write come to disagree.
  v_post_url       text;
  v_analytics_url  text;
  v_post_name      text;
  v_post_content   text;
  v_post_age       text;
  v_est_date       timestamptz;
  v_impressions    bigint;
  v_likes          bigint;
  v_comments       bigint;
  v_reposts        bigint;
  v_saves          bigint;
  v_interactions   bigint;
  v_provided       numeric;
  v_calculated     numeric;
  v_format         text;
  v_scraped_at     timestamptz;
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

    -- ⚠️ THE `n_*` VALUES ARRIVE ALREADY TYPED AND ALREADY DATE-RESOLVED from
    -- src/services/ingest.ts. `->>` yields SQL NULL for a JSON null, so the
    -- four-state discipline crosses the boundary intact; arcbase_num guards
    -- against anything else arriving as text.
    v_post_url      := v_elem->>'post_url';
    v_analytics_url := v_elem->>'analytics_url';
    v_post_name     := v_elem->>'post_name';
    v_post_content  := v_elem->>'post_content';
    v_post_age      := v_elem->>'post_date';
    v_est_date      := public.arcbase_ts(v_elem->>'n_estimated_post_date');
    v_impressions   := public.arcbase_num(v_elem->>'n_impressions')::bigint;
    v_likes         := public.arcbase_num(v_elem->>'n_likes')::bigint;
    v_comments      := public.arcbase_num(v_elem->>'n_comments')::bigint;
    v_reposts       := public.arcbase_num(v_elem->>'n_reposts')::bigint;
    v_saves         := public.arcbase_num(v_elem->>'n_saves')::bigint;
    v_interactions  := public.arcbase_num(v_elem->>'n_interactions')::bigint;
    v_provided      := public.arcbase_num(v_elem->>'n_provided_rate');
    v_calculated    := public.arcbase_num(v_elem->>'n_calculated_rate');
    v_format        := v_elem->>'post_format_type';
    v_scraped_at    := public.arcbase_ts(v_elem->>'scraped_at');

    -- Snapshot BEFORE the upsert. This is the only way to answer "did anything
    -- actually change?", which `xmax` cannot tell us — it distinguishes an insert
    -- from an update and nothing more.
    select * into v_old from public.posts where linkedin_post_id = v_post_id;
    v_found := found;

    -- ⚠️ `is not distinct from` THROUGHOUT, NEVER `=`. Two NULLs are equal here
    -- and `null = null` is null, which would fall through to UPDATED and report a
    -- change that did not happen on every row carrying an unreadable metric.
    v_same := v_found
      and v_old.client_id                  is not distinct from p_client_id
      and v_old.post_url                   is not distinct from v_post_url
      and v_old.analytics_url              is not distinct from v_analytics_url
      and v_old.post_name                  is not distinct from v_post_name
      and v_old.post_content               is not distinct from v_post_content
      and v_old.post_age                   is not distinct from v_post_age
      and v_old.estimated_post_date        is not distinct from v_est_date
      and v_old.impressions                is not distinct from v_impressions
      and v_old.likes                      is not distinct from v_likes
      and v_old.comments                   is not distinct from v_comments
      and v_old.reposts                    is not distinct from v_reposts
      and v_old.saves                      is not distinct from v_saves
      and v_old.interactions               is not distinct from v_interactions
      and v_old.provided_engagement_rate   is not distinct from v_provided
      and v_old.calculated_engagement_rate is not distinct from v_calculated
      and v_old.post_format_type           is not distinct from v_format
      and v_old.scraped_at                 is not distinct from v_scraped_at;

    -- ⚠️ client_id IS OVERWRITTEN ON CONFLICT. If the same post is re-uploaded
    -- under a different Client, the operator's most recent selection wins: the
    -- person choosing from the dropdown is the authority on whose post this is.
    insert into public.posts (
      linkedin_post_id, client_id, post_url, analytics_url, post_name, post_content,
      post_age, estimated_post_date, impressions, likes, comments, reposts, saves,
      interactions, provided_engagement_rate, calculated_engagement_rate,
      post_format_type, scraped_at, uploaded_at, uploaded_by
    ) values (
      v_post_id, p_client_id, v_post_url, v_analytics_url, v_post_name, v_post_content,
      v_post_age, v_est_date, v_impressions, v_likes, v_comments, v_reposts, v_saves,
      v_interactions, v_provided, v_calculated, v_format, v_scraped_at, now(), auth.uid()
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
      uploaded_by                = excluded.uploaded_by
    returning (xmax = 0) into v_is_insert;

    if v_is_insert then
      v_inserted := v_inserted + 1;
    elsif v_same then
      v_unchanged := v_unchanged + 1;
    else
      v_updated := v_updated + 1;
    end if;
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
  'Atomic ingest into the app-owned public.posts, and NOTHING else (ADR 0010 S3). The dual-write to public.linkedin_posts_staging and public.post_attributes is gone; both tables remain but are no longer written, so bi.* begins going stale from the moment this is applied. Attribution is p_client_id — the Client the operator selected. Writes the immutable public.uploads audit row (connections_count null when absent, never 0). The inserted/updated/unchanged tally is now computed from the posts upsert: inserted from xmax = 0, unchanged when every written value is NOT DISTINCT FROM the stored one. Typed values arrive pre-resolved from src/services/ingest.ts; unreadable metrics are NULL, never 0. Rolls back the whole call on any bad row.';

revoke all     on function public.ingest_metrics(uuid, text, jsonb, int, int) from public;
grant  execute on function public.ingest_metrics(uuid, text, jsonb, int, int) to authenticated;

-- ============================================================================
-- 4. Tell PostgREST the schema moved
-- ============================================================================

notify pgrst, 'reload schema';

-- ============================================================================
-- 5. ⚠️ FINAL STATEMENT — the one result the SQL editor will actually show you
-- ============================================================================
--
-- ⚠️ WRITE DOWN `staging_rows_frozen_at` AND `post_attributes_frozen_at`. From
-- now on those two numbers must NEVER change again. If either grows after an
-- upload, something is still dual-writing and this pair did not fully apply.

select
  (select count(*) from public.posts)                                        as posts_rows,
  (select count(*) from public.client_posts)                                 as client_posts_rows,
  (select count(*) from public.client_posts where post_format_type is not null) as rows_with_format,
  (select count(*) from public.linkedin_posts_staging)                       as staging_rows_frozen_at,
  (select count(*) from public.post_attributes)                              as post_attributes_frozen_at;
