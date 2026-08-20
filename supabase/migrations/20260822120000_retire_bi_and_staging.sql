-- ============================================================================
-- ArcBase — RETIRE the external analytics layer (ADR 0010, final slice)
-- CLI migration copy of supabase/retire-bi-and-staging.sql — kept identical by
-- supabase/sql-sync.test.ts. Read that file's runbook before applying either.
-- ============================================================================
--
-- ⚠️ APPLIED TO PRODUCTION 2026-08-20. DO NOT EDIT THE SQL BELOW.
--
-- It ran successfully and its verification row read: all five drop targets NULL,
-- `arcbase_num` and `arcbase_ts` both surviving, `posts_rows` = 271 (unchanged).
-- Both discovery queries were run first — `bi` held exactly three views
-- (linkedin_post_latest, linkedin_monthly_summary, linkedin_unmatched_staging_clients)
-- plus their auto-generated array types, and NOTHING outside `bi` depended on it.
--
-- ⚠️ FROM HERE THIS FILE IS A RECORD, NOT A PLAN. Editing its statements would
-- make the file and the database disagree with no way to tell which is which. A
-- correction is a LATER pair, never an edit to this one. Only this banner was
-- added after the fact; not one executable line was touched.
--
-- ⚠️ WHAT IT DESTROYED, PERMANENTLY:
--   • `public.linkedin_posts_staging` — 272 rows, including post
--     7402810995875725312 (author "Harvard Business School Executive Education
--     Women on Boards Program …"), the one row the backfill's name match never
--     carried into public.posts. It was knowingly let go.
--   • `public.post_attributes` — 272 rows.
--   • schema `bi` and its three views.
--   • `backfill_posts_from_staging()` and `backfill_post_attributes()`, whose
--     inputs are now gone; the historical backfill can never be re-run.
--
-- ⚠️ IT WAS APPLIED BEFORE THE APPLICATION DEPLOY, i.e. with checklist box 1
-- deliberately unmet. That was a considered call — no one was using the live app
-- — and it left the STAFF surfaces (dashboard, clients, posts, staff report)
-- erroring against a missing schema until the ADR 0010 code shipped. The
-- client-facing `/r/[token]` report was unaffected throughout, because it reads
-- through `report_link_read`, which had already been repointed at
-- `public.client_posts`.
--
-- ----------------------------------------------------------------------------
-- The original pre-application header follows, unchanged.
-- ----------------------------------------------------------------------------
--
-- ⚠️ DO NOT RUN THIS YET. AS OF WRITING IT MUST NOT BE APPLIED.
--
-- `origin/main` does NOT contain the ADR 0010 cutover. Production is still
-- serving code that reads `bi.*` through `.schema("bi")`. Running this today
-- takes the live app's data source away mid-request: every dashboard figure and
-- every Client report goes blank or errors, instantly, with no rollback.
--
-- This file exists so the retirement is WRITTEN DOWN and reviewable, not so it
-- can be run. It is applied only after the checklist below is satisfied — every
-- box, by a human, in order.
--
-- ⚠️ IT HAS ALREADY BEEN PASTED INTO PRODUCTION ONCE, ON 2026-08-20, AND FAILED
-- ON ITS OWN BUG (see section 2 — the drops were ordered wrongly and `bi` now
-- goes first). The editor runs a pasted script in one transaction, so that
-- failure rolled everything back. A comment saying "do not run" evidently is not
-- a control, so section 1 now has an ARMING GUARD: this script refuses to do
-- anything at all until a marker table is created by hand. A stray paste is now
-- a no-op with an explanation rather than a partially-dropped database.
--
-- ⚠️ THAT RUN DID PROVE SOMETHING USEFUL, and it is recorded here rather than
-- re-derived: the guard in section 1 PASSED. `public.posts` is non-empty (the
-- backfill has run), `ingest_metrics` no longer writes staging, and
-- `report_link_read` no longer reads `bi`. The DATABASE side of the cutover is
-- applied in production. Only checklist box 1 — the application deploy — is
-- still open.
--
-- ----------------------------------------------------------------------------
-- PRECONDITION CHECKLIST — all four, or stop
-- ----------------------------------------------------------------------------
--
--  [ ] 1. THE APP DEPLOY HAS LANDED AND IS SERVING.
--         `origin/main` contains the ADR 0010 slices (posts-ownership,
--         posts-read-view, posts-sole-source) and the deploy that carries them
--         is live. Confirm by loading the dashboard and one `/r/<token>` report
--         and seeing real figures — not by reading the branch.
--
--  [ ] 2. NO DEPLOYED CODE READS `bi.*` ANY MORE.
--         ⚠️ A GREP OVER TYPESCRIPT IS NOT ENOUGH, and this exact mistake has
--         already been made once in this workstream: slice S2's acceptance was
--         `grep '.schema("bi")' src/` returning nothing. It returned nothing,
--         it was true, and it missed `report_link_read` — which read
--         `bi.linkedin_post_latest` in plpgsql, where no TypeScript grep can
--         see it. The SQL half of this is machine-checked in section 1 below;
--         the application half is yours.
--
--  [ ] 3. ARCBASE HAS RUN ON `public.posts` FOR ABOUT A WEEK, INCLUDING AT
--         LEAST ONE FULL UPLOAD, and the figures were checked against what the
--         old surface used to report.
--
--  [ ] 4. THE HISTORICAL BACKFILL WILL NEVER BE RE-RUN.
--         ⚠️ THIS IS THE IRREVERSIBLE ONE. `public.backfill_posts_from_staging()`
--         reads BOTH sources this script destroys:
--           • `public.linkedin_posts_staging` — every historical row it loads;
--           • `bi.linkedin_post_latest`        — where it COPIES
--             `estimated_post_date` from, rather than re-deriving it, so that
--             history and new uploads share one dating convention.
--         Once either is gone the backfill cannot be re-run, cannot be
--         re-derived, and `public.posts` is the only copy of that history that
--         will ever exist again. Take a database backup first.
--
-- ----------------------------------------------------------------------------
-- ⚠️ SECTION 0 — DISCOVERY. RUN THIS FIRST, ALONE, AND READ THE OUTPUT.
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE DROP LIST FOR `bi` IS NOT WRITTEN FROM THIS REPO, DELIBERATELY. The
-- repo names exactly one object — `bi.linkedin_post_latest` — because that is
-- the only one ArcBase ever read. The schema was built and is owned OUTSIDE this
-- repository, so it may hold views, tables, functions or types nothing here has
-- ever heard of. Enumerating from the repo would either leave objects behind or,
-- worse, describe the drop as complete when it was not.
--
-- So: copy the query below into a NEW query, run it ALONE, and read every row.
-- If it lists anything you do not recognise as an ArcBase analytics artifact,
-- STOP and find out what it is before running section 2.
--
-- ⚠️ THIS IS NOT HYPOTHETICAL. The 2026-08-20 run's error message named two
-- objects nothing in this repository has ever referenced:
--
--     bi.linkedin_post_latest             — the one object the repo knew about
--     bi.linkedin_monthly_summary         — never referenced anywhere in ArcBase
--     bi.linkedin_unmatched_staging_clients
--         ⚠️ the NAME-MATCH MISS LIST: staging rows whose author name matched no
--         Client. This is the diagnostic that would have shown the 14 posts
--         stranded on 2026-08-18 — the incident ADR 0010 exists because of. It is
--         obsolete now that attribution is a client_id foreign key stamped at
--         upload, but understand it before you destroy it.
--
-- ⚠️ AND THAT LIST IS STILL NOT KNOWN TO BE COMPLETE. The error names only the
-- objects that depend on `linkedin_posts_staging`; a `bi` object that depends on
-- neither staging nor another listed view would not have appeared in it. Run the
-- discovery query.
--
--   select n.nspname            as schema,
--          c.relname            as object,
--          case c.relkind
--            when 'r' then 'table'
--            when 'v' then 'view'
--            when 'm' then 'materialized view'
--            when 'f' then 'foreign table'
--            when 'p' then 'partitioned table'
--            when 'S' then 'sequence'
--            when 'i' then 'index'
--            else c.relkind::text
--          end                  as kind,
--          pg_get_userbyid(c.relowner) as owner
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'bi'
--   union all
--   select n.nspname,
--          p.proname,
--          'function',
--          pg_get_userbyid(p.proowner)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'bi'
--   union all
--   select n.nspname, t.typname, 'type', pg_get_userbyid(t.typowner)
--     from pg_type t
--     join pg_namespace n on n.oid = t.typnamespace
--    where n.nspname = 'bi'
--      and t.typtype <> 'c'
--    order by kind, object;
--
-- ⚠️ SECOND DISCOVERY QUERY — WHAT DEPENDS ON `bi` FROM OUTSIDE IT. Section 2
-- drops the schema with `cascade`, which would silently take any outside
-- dependant with it. Expect ZERO rows; anything here must be understood first.
--
--   select distinct dn.nspname || '.' || dep.relname as dependent_object,
--                   sn.nspname || '.' || src.relname as depends_on
--     from pg_depend d
--     join pg_rewrite r    on r.oid  = d.objid
--     join pg_class  dep   on dep.oid = r.ev_class
--     join pg_namespace dn on dn.oid = dep.relnamespace
--     join pg_class  src   on src.oid = d.refobjid
--     join pg_namespace sn on sn.oid = src.relnamespace
--    where sn.nspname = 'bi'
--      and dn.nspname <> 'bi';
--
-- ⚠️ ALSO WRITE DOWN THESE TWO NUMBERS BEFORE PROCEEDING — they are the row
-- counts you are about to destroy, and the only record of how much there was:
--
--   select (select count(*) from public.linkedin_posts_staging) as staging_rows,
--          (select count(*) from public.post_attributes)        as attribute_rows,
--          (select count(*) from public.posts)                  as posts_rows;
--
-- ----------------------------------------------------------------------------
-- WHAT THIS SCRIPT DROPS, AND WHAT IT DELIBERATELY DOES NOT
-- ----------------------------------------------------------------------------
--
-- DROPPED (each verified below, at its statement):
--   • public.backfill_posts_from_staging()  — one-time migration, already run
--   • public.backfill_post_attributes()     — one-time repair, already run
--   • public.post_attributes                — no longer read or written
--   • public.linkedin_posts_staging         — no longer read or written
--   • schema bi and everything in it        — no longer read
--
-- ⚠️ NOT DROPPED, AND THE DISTINCTION MATTERS:
--   • public.arcbase_num(text) / public.arcbase_ts(text) — these LOOK like
--     migration helpers and are not. The LIVE `public.ingest_metrics` calls both
--     on every row of every upload (they are what keeps NULL from becoming 0
--     crossing the jsonb boundary). Dropping them breaks ingestion outright.
--     Verified by reading the body of the current `ingest_metrics`, not assumed
--     from their names.

-- ============================================================================
-- 1. GUARD — refuse to run if the SQL-side preconditions are not met
-- ============================================================================
--
-- ⚠️ THIS CHECKS WHAT A MACHINE CAN CHECK, AND NOTHING MORE. It cannot see
-- whether your application deploy landed; that stays box 1 of the checklist.
-- What it can prove is that the database itself has finished the cutover, which
-- is exactly the half a human eye slides over.

-- ⚠️ ARMING. A comment that says "do not run" is not a control — this script was
-- pasted into production once already, on the strength of one. This is the
-- control: until the marker table exists, every statement below is unreachable,
-- and an accidental paste is a no-op that explains itself.
--
-- To arm, having read BOTH discovery queries above, run this ONE statement alone:
--
--     create table public.arcbase_retirement_armed ();
--
-- Section 2's last act drops it again, so arming never persists past one run.
do $$
begin
  if to_regclass('public.arcbase_retirement_armed') is null then
    raise exception
      'REFUSING: not armed. This script drops bi.* and linkedin_posts_staging IRREVERSIBLY. Run both discovery queries in section 0, read every row, then run:  create table public.arcbase_retirement_armed ();  and paste this script again.';
  end if;
end $$;

do $$
begin
  -- An empty `posts` means the backfill never ran. Dropping staging then throws
  -- away the ONLY copy of the history — silently, because an empty table reads
  -- as "no posts yet" rather than as an error.
  if (select count(*) from public.posts) = 0 then
    raise exception
      'REFUSING: public.posts is empty. The backfill has not run — dropping staging would destroy the only copy of the history. See supabase/POSTS-OWNERSHIP-APPLY.md.';
  end if;

  -- If ingest still writes staging, the cutover's last slice was never applied
  -- and dropping the table breaks every future upload.
  if pg_get_functiondef('public.ingest_metrics(uuid, text, jsonb, int, int)'::regprocedure)
       ~ 'linkedin_posts_staging' then
    raise exception
      'REFUSING: public.ingest_metrics still writes linkedin_posts_staging. Apply supabase/posts-sole-source.sql first.';
  end if;

  -- ⚠️ THE plpgsql READ A TYPESCRIPT GREP CANNOT SEE. This is the exact defect
  -- that shipped in slice S2, asserted here so it cannot ship again.
  if pg_get_functiondef('public.report_link_read(text, text)'::regprocedure)
       ~ 'bi\.linkedin_post_latest' then
    raise exception
      'REFUSING: public.report_link_read still reads bi.linkedin_post_latest. The client-facing report would break. Apply supabase/posts-sole-source.sql first.';
  end if;
end $$;

-- ============================================================================
-- 2. DROPS — `bi` FIRST, because the bi views READ the tables below
-- ============================================================================
--
-- ⚠️ THIS ORDER WAS WRONG IN THE FIRST VERSION AND IS THE REASON THE 2026-08-20
-- RUN FAILED. That version dropped `linkedin_posts_staging` before the `bi`
-- schema, under a comment claiming each object goes after its last reader —
-- while the bi views are readers of staging. Postgres caught it:
--
--     ERROR: 2BP01: cannot drop table linkedin_posts_staging because other
--            objects depend on it
--     DETAIL: view bi.linkedin_post_latest depends on table linkedin_posts_staging
--             view bi.linkedin_monthly_summary depends on view bi.linkedin_post_latest
--             view bi.linkedin_unmatched_staging_clients depends on table
--                  linkedin_posts_staging
--
-- ⚠️ DO NOT "FIX" A FUTURE RECURRENCE WITH `cascade` ON THE TABLE DROPS. The hint
-- Postgres prints suggests exactly that, and it is the wrong move here: a
-- cascading table drop would remove whatever depends on it WITHOUT NAMING IT,
-- which is how an object nobody knew about disappears silently. Dropping the
-- schema first makes the table drops dependency-free, so they can stay strict.

-- ⚠️ FIRST, AND IT DROPS EVERY OBJECT SECTION 0 LISTED — INCLUDING ANY THIS REPO
-- HAS NEVER HEARD OF, AND THERE ARE AT LEAST TWO. `cascade` is unavoidable here:
-- a schema containing objects cannot be dropped without it. That is precisely why
-- both discovery queries are mandatory rather than advisory. If you have not read
-- their output, stop and read it now.
--
-- Among what goes: `bi.linkedin_post_latest`, the exact-string name-match view
-- whose join silently stranded a Client's entire post history on 2026-08-18 and
-- is the reason ADR 0010 exists.
drop schema if exists bi cascade;

-- The one-time migration that loaded history into public.posts. It reads BOTH
-- linkedin_posts_staging and bi.linkedin_post_latest — plpgsql bodies are not
-- tracked dependencies, so nothing above stopped it existing, and nothing below
-- would stop it either. It goes here because after this statement the tables
-- below have no reader left anywhere in the database.
-- ⚠️ RE-RUNNING IT IS IMPOSSIBLE FROM HERE ON. See checklist box 4.
drop function if exists public.backfill_posts_from_staging();

-- The one-time repair that copied raw post_format_type out of staging into
-- post_attributes. Verified orphaned: nothing in src/ and no other SQL object
-- calls it — its only caller was a human following POST-ATTRIBUTES-APPLY.md.
drop function if exists public.backfill_post_attributes();

-- Verified unread: `report_link_read` projected its `attributes` key from this
-- table until posts-sole-source, which now projects it from the row's own
-- post_format_type; no TypeScript reads it (the post-attributes seam was deleted
-- in slice S3); and ingest_metrics no longer writes it. The 2026-08-20 run also
-- got PAST this statement before failing on the next one, which proves nothing in
-- `bi` depended on it either.
-- ⚠️ NO `cascade`. If something still depends on this table, the drop must FAIL
-- and tell you so — a cascade would remove that dependant silently.
drop table if exists public.post_attributes;

-- The all-text landing table the external view layer was built on. Verified
-- unwritten (guard above) and unread (no `.from("linkedin_posts_staging")`
-- anywhere in src/, and the only SQL readers were the bi views and the two
-- functions dropped above). ⚠️ Again no `cascade`, for the same reason.
drop table if exists public.linkedin_posts_staging;

-- Arming is single-use: the next accidental paste hits the guard again.
drop table if exists public.arcbase_retirement_armed;

-- ============================================================================
-- 3. VERIFY — the last statement, so the SQL editor shows it
-- ============================================================================
--
-- Expect every column NULL except `posts_rows`, which must be unchanged from the
-- number you wrote down in section 0. A non-null anywhere else means that object
-- survived; a changed `posts_rows` means something dropped more than it should
-- have, and you should restore from the backup taken at checklist box 4.

select to_regclass('public.linkedin_posts_staging')            as staging_gone_if_null,
       to_regclass('public.post_attributes')                   as attributes_gone_if_null,
       to_regnamespace('bi')                                   as bi_schema_gone_if_null,
       to_regproc('public.backfill_posts_from_staging')        as backfill_gone_if_null,
       to_regproc('public.backfill_post_attributes')           as attr_backfill_gone_if_null,
       -- ⚠️ THESE TWO MUST SURVIVE — live ingest calls them on every row.
       to_regproc('public.arcbase_num')                        as arcbase_num_must_remain,
       to_regproc('public.arcbase_ts')                         as arcbase_ts_must_remain,
       (select count(*) from public.posts)                     as posts_rows;
