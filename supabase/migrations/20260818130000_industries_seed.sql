-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the industries registry — the CLI migration copy.
--
-- Twin of supabase/industries-seed.sql; the SQL in the two files is identical and
-- supabase/sql-sync.test.ts fails if they drift. Timestamped AFTER
-- 20260818120000_client_industry_writer.sql, which creates the table this fills.
--
-- ⚠️ DATA, NOT SCHEMA — and the only migration in this repo that is. It adds no
-- table, column, policy or function; it records a decision Arcbound made about
-- its own vocabulary. It is here rather than in the schema migration because the
-- schema shipped deliberately empty (see that file's header).
--
-- ⚠️ IDEMPOTENT. `on conflict do nothing` with no target covers BOTH uniqueness
-- rules on this table: the plain `unique` on `name` and the case-insensitive
-- `industries_name_ci` index on `lower(name)`.
--
-- Applied by staff via the Supabase SQL editor using the twin script, never by
-- `db push` — see supabase/CLIENT-INDUSTRY-WRITER-APPLY.md.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.industries (name)
values
  ('Business'),
  ('Coaching'),
  ('Finance'),
  ('Food'),
  ('Health'),
  ('Services'),
  ('Tech')
on conflict do nothing;

-- Expect EXACTLY 7 rows, every one `active`.
select name, status, created_at
  from public.industries
 order by name;
