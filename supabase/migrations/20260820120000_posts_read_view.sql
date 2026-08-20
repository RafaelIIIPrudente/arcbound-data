-- ArcBase POSTS READ VIEW (ADR 0010, slice S2) — the CLI migration copy.
--
-- Twin of supabase/posts-read-view.sql; the SQL in the two files is identical and
-- supabase/sql-sync.test.ts fails if they drift. Timestamped AFTER
-- 20260819120000_posts_ownership.sql, which creates the `public.posts` this view
-- projects.
--
-- ⚠️ APPLIED BY STAFF THROUGH THE SUPABASE SQL EDITOR USING THE TWIN SCRIPT, NEVER
-- BY `supabase db push`. `public.clients` was created outside this repo's
-- migrations, so the CLI's picture of the schema is not the live one. The runbook
-- is supabase/POSTS-READ-VIEW-APPLY.md.
--
-- ⚠️ THIS PAIR IS DEPLOY-ORDERED AGAINST THE APPLICATION, AND THE ORDER IS SQL
-- FIRST. The code shipped alongside it reads `public.client_posts` and nothing
-- else; deploying that code before this view exists makes every read 404.
--
-- ⚠️ AND IT IS GATED ON A NUMBER. This view is only as populated as
-- `public.posts`, so the historical backfill from the S1 pair must have RUN and
-- its row count must have been READ before the application is repointed. An empty
-- posts table produces an empty view, which renders as "no posts" rather than as
-- an error — a blank report that raises nothing.
--
-- ⚠️ IT DROPS NOTHING. bi.* and the staging write are untouched; reverting the
-- four application read sites restores them instantly. Retiring is slice S3.
-- ============================================================================
-- 1. public.client_posts
-- ============================================================================
--
-- ⚠️ `security_invoker = true` IS LOAD-BEARING AND ITS ABSENCE FAILS SILENTLY.
-- A Postgres view runs with its OWNER's privileges by default, which would make
-- this view bypass the row-level security policy on `public.posts` entirely.
-- ArcBase is single-tenant and that policy is `select to authenticated using
-- (true)`, so the OUTCOME is identical today — which is exactly why the mistake
-- would never be noticed, and exactly why it is set explicitly. The day a policy
-- narrows, an owner-rights view keeps serving every row and no error is raised
-- anywhere.
--
-- ⚠️ EVERY NUMERIC COLUMN IS CAST EXPLICITLY, AND THIS IS NOT DECORATION. The
-- consuming TypeScript declares each metric `number | null` and `asPage` ASSERTS
-- the row type rather than checking it. If PostgREST serialised a rate as the
-- JSON string "4.2", it would pass straight through the seam, hit `num()`/
-- `finite()` — which test `typeof v === "number"` — and become NULL or a wrong
-- figure on a PDF a client downloads, with no error logged anywhere at all.
-- Counts are pinned to `bigint` and the two rates to `double precision` so the
-- wire format is unambiguous. ⚠️ THE CASTS ARE NOT PROOF: the runbook's raw-JSON
-- spot-check is the only thing that shows what actually arrives.
--
-- `create or replace` rather than drop-and-create: the column list and types are
-- fixed by `BiPostRow`, so a re-run is a no-op and there is never a window in
-- which the view does not exist.

create or replace view public.client_posts
with (security_invoker = true)
as
select
  -- Attribution, straight from the foreign key. No name matching anywhere.
  p.client_id                                        as client_id,
  -- The one field not held on `posts`; `client_id` is NOT NULL and a foreign key,
  -- so this inner join cannot drop a row.
  c.name                                             as client_name,
  p.linkedin_post_id                                 as linkedin_post_id,
  p.post_url                                         as post_url,
  p.post_content                                     as post_content,
  -- Raw relative age, exactly as the scrape sent it.
  p.post_age                                         as post_age,
  -- Already resolved at ingest by src/lib/post-date.ts. NULL means undatable and
  -- is never rewritten here.
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
  p.uploaded_at                                      as uploaded_at
from public.posts p
join public.clients c on c.id = p.client_id;

comment on view public.client_posts is
  'App-owned read projection of public.posts in the exact shape ArcBase''s BiPostRow consumes (ADR 0010 S2). Replaces bi.linkedin_post_latest as the read surface. A STRAIGHT PROJECTION ONLY — no dedup, no date resolution, no name matching: posts is already keyed, typed, resolved and attributed by foreign key. Deliberately NOT named *_latest, because there is one row per post and nothing to pick. security_invoker so the RLS policy on public.posts still applies.';

-- Same reach as the table it projects: any authenticated staff member reads,
-- nobody writes (a view over a table with no write policy is not writable in any
-- case). `anon` is granted nothing, which is what keeps this off the public
-- report-link path.
revoke all on public.client_posts from public;
grant select on public.client_posts to authenticated;

-- ============================================================================
-- 2. Tell PostgREST the schema moved
-- ============================================================================
--
-- ⚠️ WITHOUT THIS THE VIEW 404s AND EVERY READ THROWS. PostgREST serves only what
-- its cached schema knows about, and the application deployed alongside this pair
-- reads `client_posts` and nothing else.

notify pgrst, 'reload schema';

-- ============================================================================
-- 3. ⚠️ FINAL STATEMENT — the one result the SQL editor will actually show you
-- ============================================================================
--
-- ⚠️ `extra_rows_now_visible` SHOULD BE POSITIVE OR ZERO, NEVER NEGATIVE.
-- Positive is the FIX working: posts that bi.* dropped for an author-name
-- mismatch are attributed by foreign key here and appear for the first time.
-- NEGATIVE means the backfill has not run or did not finish, and deploying the
-- application against this view would blank out reports. That is a STOP.

select
  (select count(*) from public.posts)                    as posts_rows,
  (select count(*) from public.client_posts)             as app_view_rows,
  (select count(*) from bi.linkedin_post_latest)         as bi_view_rows,
  (select count(*) from public.client_posts)
    - (select count(*) from bi.linkedin_post_latest)     as extra_rows_now_visible;
