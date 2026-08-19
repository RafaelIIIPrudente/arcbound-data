-- ArcBase POSTS READ VIEW (ADR 0010, slice S2) — copy-paste for the Supabase SQL
-- editor (Dashboard → SQL Editor → New query → paste → Run). Same DDL as
-- supabase/migrations/20260820120000_posts_read_view.sql. Runbook:
-- supabase/POSTS-READ-VIEW-APPLY.md. Plan: D1/D2 in
-- docs/specs/2026-08-19-analytics-ownership-execution.md.
--
-- ⚠️ APPLY supabase/posts-ownership.sql FIRST, AND RUN ITS BACKFILL. This view
-- reads `public.posts`. If the historical backfill has not run, `public.posts` is
-- empty or partial, and the moment the application code that ships with this pair
-- is deployed EVERY REPORT GOES BLANK. The runbook's row-count check is the gate,
-- and it is not optional.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS
--
-- One read-only projection of the app-owned `public.posts` in exactly the shape
-- the application's `BiPostRow` already consumes, so the four read sites can be
-- repointed by changing one clause each and NOTHING downstream of them moves.
-- `POST_COLUMNS`, `SELECT_COLUMNS`, the paging, the report builders and every
-- chart are untouched. That firewall is the whole reason this slice is small.
--
-- ⚠️ IT IS A STRAIGHT PROJECTION AND MUST STAY ONE. No dedup, no date resolution,
-- no attribution logic, no cleaning. `bi.linkedin_post_latest` needed all four
-- because it read a keyless all-text staging table; `public.posts` has
-- `linkedin_post_id` as its PRIMARY KEY, typed columns, a resolved
-- `estimated_post_date` and a real `client_id` foreign key. If a future edit adds
-- a `distinct on` or a `regexp_replace` here, the fault is upstream — go fix it
-- there.
--
-- ⚠️ AND THAT IS WHY IT IS NOT CALLED `*_latest`. `bi.linkedin_post_latest` earned
-- that suffix by picking the newest scrape per post out of a table that could hold
-- several. There is exactly one row per post here and nothing to pick, so the
-- suffix would name machinery that no longer exists — the same false-prose defect
-- this slice is otherwise removing from the upload screens.
--
-- ⚠️ IT DROPS NOTHING. `bi.linkedin_post_latest`, `public.linkedin_posts_staging`
-- and the staging write all continue exactly as they are. Reverting the four
-- application lines puts every read back on `bi.*` instantly. Retiring anything is
-- S3, separately confirmed.
-- ═══════════════════════════════════════════════════════════════════════════════

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
