-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the industries registry — the paste-into-the-SQL-editor copy.
--
-- Twin of supabase/migrations/20260818130000_industries_seed.sql; the SQL in the
-- two files is identical and supabase/sql-sync.test.ts fails if they drift.
--
-- ⚠️ THIS FILE IS THE DECISION, NOT A GUESS. `client-industry-writer.sql` left
-- this table EMPTY on purpose, and said why: "a guessed seed would be
-- indistinguishable from a decision once it is in the table. Admins fill the
-- list; it starts empty." These seven values are Arcbound's own answer, taken
-- from the industries of the current client roster, so the objection is spent.
--
-- The roster listed 27 clients across 7 distinct industries:
--   Tech 9 · Coaching 6 · Services 4 · Health 4 · Food 2 · Business 1 · Finance 1
-- Only the 7 distinct names are stored. Counting how many Clients are in each is
-- the reporting layer's job and must never be duplicated here.
--
-- ⚠️ RUN THIS THROUGH THE SQL EDITOR, NOT `create_industry`. That function
-- refuses from the editor with `admin role required` (42501), because there is no
-- logged-in ArcBase user for `is_admin()` to recognise — the guard working, not a
-- fault. The editor's role bypasses RLS, so a direct insert is the documented
-- path (supabase/CLIENT-INDUSTRY-WRITER-APPLY.md).
--
-- ⚠️ IDEMPOTENT. `on conflict do nothing` with no target covers BOTH uniqueness
-- rules on this table: the plain `unique` on `name` and the case-insensitive
-- `industries_name_ci` index on `lower(name)`. Re-running changes nothing and
-- errors on nothing.
--
-- ⚠️ THE SELECT IS LAST ON PURPOSE. The Supabase SQL editor shows the results of
-- the LAST statement only, and a seed is not applied until its row count has been
-- seen — the lesson from docs/decisions/2026-08-18-name-match-attribution-failure.md,
-- where a repair was believed applied and had never run.
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
