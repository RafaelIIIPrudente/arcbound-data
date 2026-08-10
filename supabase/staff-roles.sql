-- ArcBase Staff Roles — CONSOLIDATED copy-paste for the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run). ADDITIVE ONLY — it creates
-- public.staff_roles + public.is_admin() and DROPS/ALTERS nothing that already
-- exists. Same DDL as supabase/migrations/20260802120000_staff_roles.sql.
--
-- The privilege tier attached to an Arcbound staff account: 'admin' or 'analyst'
-- (ADR 0013, which AMENDS ADR 0007 — staff still share ONE dataset; this adds
-- privilege tiers, not data partitions). Security posture:
--   • ABSENCE OF A ROW MEANS 'analyst'. Least privilege: a new staff account is
--     never silently an admin, and no backfill step can be forgotten into a
--     privilege grant.
--   • OWN-ROW READ ONLY. A staff member may read their own role and nothing else;
--     the roster is NOT exposed to `authenticated` at large. S3's admin screen
--     reads the full list through a SECURITY DEFINER function instead.
--   • NO write policies at all. Rows are written ONLY by this script's seed and
--     (from S3) by SECURITY DEFINER functions, whose owner bypasses RLS. An
--     analyst therefore cannot promote themselves by any route the app exposes.
--   • This is why the role does NOT live in auth.users.user_metadata: that field
--     is writable by the user it describes (auth.updateUser), so an analyst could
--     grant themselves admin without touching the app at all.

-- ============================================================================
-- 1. staff_roles (app-owned privilege tier, one row per staff account)
-- ============================================================================
--
-- A CHECK constraint rather than a Postgres enum: adding a third tier later is a
-- one-line change here, where an enum would need a type migration and would make
-- the value list awkward to read back out.
create table if not exists public.staff_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','analyst')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_roles enable row level security;

-- ⚠️ THE PREDICATE IS `user_id = auth.uid()` AND IT MUST NOT BECOME `is_admin()`.
--
-- A policy ON THIS TABLE that consulted a helper which itself reads THIS TABLE is
-- the classic Postgres self-referential-policy footgun: the moment that helper is
-- invoker-rights (or the table gains `force row level security`), the read
-- re-enters the policy and Postgres aborts with 42P17 "infinite recursion detected
-- in policy for relation". The own-row predicate below cannot recurse no matter
-- how `is_admin()` is later redefined, which is precisely why it is written this
-- way rather than relying on the SECURITY DEFINER below to break the cycle.
--
-- Own-row is also all the app needs: `getRole()` asks only "what am I?".
drop policy if exists staff_roles_select_own on public.staff_roles;
create policy staff_roles_select_own on public.staff_roles
  for select to authenticated using (user_id = auth.uid());

-- ============================================================================
-- 2. is_admin() (the helper S2 policies and S3 functions consult)
-- ============================================================================
--
-- SECURITY DEFINER because callers need it to answer for tables OTHER than this
-- one. Under invoker rights the own-row policy above would already be in force,
-- so the answer would be correct only by accident of what the caller can see.
-- `set search_path = public` pins resolution so a caller-controlled search_path
-- cannot shadow `staff_roles` with a table of their own — mandatory hygiene for
-- any definer function.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all     on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'True when the CALLING user has an admin row in public.staff_roles. SECURITY DEFINER so it can be consulted from RLS policies on OTHER tables (staff_roles is own-row-readable only, so an invoker-rights version would answer from what the caller happens to see). Absence of a row is NOT admin — least privilege. Never called from a policy on staff_roles itself.';

-- ============================================================================
-- 3. Admin seed (idempotent)
-- ============================================================================
--
-- ⚠️ EDIT THE EMAIL LIST IN **BOTH** FILES OR THE GATE FAILS. This script and
-- supabase/migrations/20260802120000_staff_roles.sql are compared on their
-- EXECUTABLE SQL by supabase/sql-sync.test.ts — the header comments may differ,
-- this INSERT may not. Changing the list in one copy alone turns the test red.
--
-- Seeded in the SAME migration that creates the table so there is never a window
-- in which ArcBase has zero admins — which, with S2 enforcing, would lock every
-- governance action out of the product with no in-app way back in. `auth.users`
-- is not readable by `authenticated`, but this runs as the SQL-editor/migration
-- role, which can read it.
insert into public.staff_roles (user_id, role)
select id, 'admin' from auth.users
where email in ('rflprdnt@gmail.com')
on conflict (user_id) do update set role = 'admin', updated_at = now();
