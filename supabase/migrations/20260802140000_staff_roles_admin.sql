-- ArcBase Staff Roles ADMIN — CLI migration twin of supabase/staff-roles-admin.sql.
-- Held to the SAME executable SQL by supabase/sql-sync.test.ts (headers may
-- differ, statements may not).
--
-- Runs AFTER 20260802120000_staff_roles.sql, which creates public.staff_roles and
-- public.is_admin(). Adds the admin-only roster read (list_staff) and the
-- admin-only role write (set_staff_role) — both SECURITY DEFINER, because neither
-- auth.users nor the own-row-readable staff_roles is listable by an ordinary
-- authenticated caller, and staff_roles has no write policies at all (ADR 0013).
--
-- ⚠️ THE LAST-ADMIN INVARIANT LIVES IN set_staff_role AND NOWHERE ELSE. It is not
-- re-implemented in the client; the screen renders this function's refusal. The
-- full rationale — including why the count follows the write and why the advisory
-- lock is required — is in the paste script and is not repeated here.

-- ============================================================================
-- 1. list_staff() — every staff account with its effective Staff Role
-- ============================================================================
--
-- ⚠️ IT LEFT-JOINS `auth.users`, AND THAT DIRECTION IS THE WHOLE POINT.
--
-- Selecting from `staff_roles` instead would list only people who have ALREADY
-- been assigned — the accounts most likely to need attention (a freshly
-- provisioned staff member with no row yet) would be invisible on the very screen
-- that exists to manage them. `auth.users` is the roster; `staff_roles` is an
-- annotation on it.
--
-- `assigned` carries the distinction the join makes available: FALSE means there
-- is no staff_roles row and `analyst` is a DEFAULT (least privilege), not a
-- decision anyone recorded. Those two states behave identically and are not the
-- same fact, so the screen shows them differently.
--
-- `u.email` is `varchar` in `auth.users`; the cast to `text` is required or the
-- returned row type will not match this signature.
--
-- ⚠️ `pending` IS WHY AN INVITED PERSON DOES NOT VANISH. An invited account exists
-- in `auth.users` from the moment the invitation is sent, but has no confirmed
-- email until they accept. Without surfacing that, an admin invites someone, the
-- roster shows a normal-looking row, and there is no way to tell "they have not
-- accepted yet" from "they are set up" (ADR 0014).
--
-- ⚠️ THE DROP BELOW IS REQUIRED, NOT TIDINESS. A `returns table` column list IS the
-- function's return type, and `create or replace function` CANNOT change a return
-- type — adding `pending` without dropping first makes Postgres raise 42P13
-- ("cannot change return type of existing function"). Dropping also discards the
-- grants, which is why the revoke/grant pair further down must be re-run with it.
-- They are, in this same file: this remains ONE definition, applied as a unit.
--
-- ⚠️ AND IT IS EDITED IN PLACE, NOT RE-DEFINED IN A NEW FILE. S2 established the
-- rule: a second `create or replace` of the same function in another script leaves
-- a stale definition that silently wins whenever it is applied last, quietly
-- reverting the change with no error and no test able to see it. One definition per
-- function, always current, apply order irrelevant.
drop function if exists public.list_staff();

create or replace function public.list_staff()
returns table (
  user_id    uuid,
  email      text,
  role       text,
  assigned   boolean,
  pending    boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  -- Every column is table-qualified: `returns table` declares OUT parameters with
  -- these same names, and an unqualified reference would be ambiguous.
  return query
    select u.id,
           u.email::text,
           coalesce(sr.role, 'analyst'),
           (sr.user_id is not null),
           (u.email_confirmed_at is null),
           sr.created_at,
           sr.updated_at
      from auth.users u
      left join public.staff_roles sr on sr.user_id = u.id
     order by u.email;
end;
$$;

revoke all     on function public.list_staff() from public;
grant  execute on function public.list_staff() to authenticated;

comment on function public.list_staff() is
  'Admin-only staff roster: every auth.users account LEFT JOINed to public.staff_roles, so accounts with no assigned role still appear (assigned = false, role defaults to analyst). Raises 42501 for a non-admin caller. SECURITY DEFINER because neither auth.users nor the own-row-readable staff_roles can be listed by an ordinary authenticated caller.';

-- ============================================================================
-- 2. set_staff_role() — assign a Staff Role, never leaving zero admins
-- ============================================================================
--
-- Order of operations is deliberate: GUARD → VALIDATE → LOCK → WRITE → COUNT.
--
-- ⚠️ THE COUNT COMES AFTER THE WRITE, ON PURPOSE. Checking first would have to
-- reason about what the write is ABOUT to do (is this a demotion? of the last
-- admin? is it a no-op re-assert?) — three cases and a subtle one. Writing and
-- then counting asks the only question that matters, of the actual post-state:
-- are there still any admins? The `raise` aborts the transaction, so the write is
-- rolled back with it. One question instead of three, and no case to miss.
--
-- ⚠️ THE ADVISORY LOCK IS NOT DECORATION. Without it, two admins demoting each
-- other concurrently each see their own write plus the other's PRE-write value,
-- each counts one remaining admin, and both commit — leaving zero admins and no
-- in-app way back. The lock serialises the read-modify-write so the second
-- transaction counts against the first's committed result. It is transaction-
-- scoped, so it releases on commit or rollback with no explicit unlock.
--
-- NOTE ON TESTABILITY: no Postgres runs in this repo's test suite, so nothing
-- here is exercised by a test. The race in particular is not reproducible by any
-- test we can write — the guard is this comment plus a source assertion that the
-- lock line is still present.
create or replace function public.set_staff_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admins int;
begin
  -- GUARD: only an admin may assign roles.
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  -- VALIDATE: reject an unknown tier before touching the table. The CHECK
  -- constraint would also catch this, but with a message about a constraint
  -- rather than about the argument.
  if p_role not in ('admin','analyst') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  -- VALIDATE: the FK would catch an unknown user on insert, but not on the
  -- conflict-update path, and its message names a constraint rather than the id.
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown user %', p_user_id using errcode = '23503';
  end if;

  -- LOCK: serialise every role change against every other one.
  perform pg_advisory_xact_lock(hashtext('public.staff_roles'));

  -- WRITE: assign, or re-assign in place. `updated_at` is stamped on every
  -- update — the table has no trigger, so an omission here would silently leave
  -- a stale timestamp on a row that did change.
  insert into public.staff_roles (user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id) do update
      set role = excluded.role, updated_at = now();

  -- COUNT: the invariant, asked of the post-write state.
  select count(*) into v_admins from public.staff_roles where role = 'admin';
  if v_admins = 0 then
    raise exception 'at least one admin must remain' using errcode = '23514';
  end if;
end;
$$;

revoke all     on function public.set_staff_role(uuid, text) from public;
grant  execute on function public.set_staff_role(uuid, text) to authenticated;

comment on function public.set_staff_role(uuid, text) is
  'Admin-only Staff Role assignment. Refuses a non-admin caller (42501), an unknown role (22023), an unknown user (23503), and any change that would leave zero admins (23514). Self-demotion is allowed while another admin remains. Serialised with a transaction-scoped advisory lock so concurrent demotions cannot both pass the last-admin check. THE LAST-ADMIN INVARIANT LIVES ONLY HERE — never re-implement it in the client.';

-- ============================================================================
-- 3. Verification — ⚠️ RUN THESE ONE AT A TIME (see the note at the top)
-- ============================================================================
--
--   select proname, prosecdef, provolatile from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('list_staff','set_staff_role');
--
--   select * from public.list_staff();
--
-- With exactly one staff account, that roster is one row and it is the admin —
-- so every role change against real data is CORRECTLY refused by the last-admin
-- rule. That is the invariant working, not a fault.
