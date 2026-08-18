-- ArcBase Client INDUSTRY + WRITER — CLI migration twin of
-- supabase/client-industry-writer.sql. The two files are compared on their
-- EXECUTABLE SQL by supabase/sql-sync.test.ts: the header comments may differ,
-- nothing below them may. Edit one and you must edit the other.
--
-- ⚠️ THE SQL EDITOR IS THE WORKING PATH FOR THIS PROJECT, NOT `supabase db push`.
-- A migration applied by CLI has bitten this repo before through a timestamp
-- ordering trap, and public.clients itself was created outside these migrations —
-- so the CLI's view of the schema is not the live one. Staff paste the script.
-- This file exists so the two histories do not diverge, and so a fresh database
-- can be built from the migrations alone.
--
-- ADDITIVE ONLY: creates public.industries, adds two NULLABLE columns to
-- public.clients, creates six SECURITY DEFINER functions, and adds, removes or
-- edits NO policy on public.clients. Shaping and the six settled decisions:
-- docs/decisions/2026-08-18-client-industry-and-writer.md.
--
-- ⚠️ NOTHING BELOW HAS EVER EXECUTED IN CI. No Postgres runs in this repo's test
-- suite; supabase/client-industry-writer.test.ts asserts on the TEXT of these
-- files. That proves they still SAY what they are supposed to say, never that
-- they work.

-- ============================================================================
-- 1. industries — the controlled list (D2)
-- ============================================================================
--
-- Admin-editable, mirroring public.services in supabase/arcbound-services.sql:
-- readable by every authenticated staff member, written ONLY through the SECURITY
-- DEFINER functions below. Free text was rejected because it is uncountable —
-- "SaaS", "saas" and "Saas" are three industries and one of the questions this
-- field exists to answer is "how many clients in SaaS".
--
-- ⚠️ DELIBERATELY NOT SEEDED. Which industries Arcbound recognises is still open
-- (see the decision record), and a guessed seed would be indistinguishable from a
-- decision once it is in the table. Admins fill the list; it starts empty.
create table if not exists public.industries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  -- ⚠️ NO TRIGGER MAINTAINS THIS. Every mutating function below sets it
  -- explicitly; omitting it there leaves the column quietly lying about a row
  -- that genuinely changed (the same trap `services.updated_at` carries).
  updated_at timestamptz not null default now(),

  constraint industries_status_known check (status in ('active', 'archived'))
);

-- ⚠️ THE PLAIN `unique` ABOVE IS NOT ENOUGH, AND THIS INDEX IS WHY.
--
-- `unique` on the column rejects only an exact repeat, so two admins can create
-- "SaaS" and "saas" and the registry silently splits the very counts it exists to
-- make possible — the uncountability that free text was rejected for, arriving
-- through the controlled list instead. Unlike `public.services` there is no `slug`
-- here to carry the machine identity, so the case-insensitive index carries it.
create unique index if not exists industries_name_ci
  on public.industries (lower(name));

alter table public.industries enable row level security;

-- Readable by any authenticated staff member; written ONLY through the SECURITY
-- DEFINER functions below (the definer owner bypasses RLS). No insert/update/
-- delete policy exists, so there is no route by which a non-admin can write here
-- even with a valid session and their own Supabase token.
drop policy if exists industries_select_authenticated on public.industries;
create policy industries_select_authenticated on public.industries
  for select to authenticated using (true);

-- ============================================================================
-- 2. The two new columns on public.clients — the first mutable fields a Client
--    has ever had
-- ============================================================================
--
-- ⚠️ BOTH ARE NULLABLE AND NULL IS A REAL STATE. Every Client that already exists
-- gets NULL for both, meaning "not recorded yet" — not "none", and not "unknown
-- industry". NOTHING BACKFILLS THEM: unlike the Services backfill in
-- arcbound-services.sql, which read real upload history, there is no evidence
-- anywhere in this database from which either value could be derived. A guess
-- written here would be indistinguishable from a fact.
--
-- ⚠️ `industry_id` HAS NO `on delete` ACTION, DELIBERATELY. The default (NO ACTION)
-- is what makes `delete_industry`'s guard REAL: an industry any Client is recorded
-- in cannot be deleted even if the function is bypassed entirely. The function
-- raises a friendlier message naming the count; the database refuses on its own.
-- Exactly the reasoning behind `client_services.service_id` having no cascade.
--
-- ⚠️ `writer_id` IS `on delete set null` (D1). The link is CURRENT STATE — "who
-- writes for them now" — not history; the audit trail lives in
-- `uploads.uploaded_by`. There is no in-app staff removal, so this fires only if
-- an account is deleted in the Supabase dashboard, and when it does the honest
-- answer genuinely becomes "nobody". Nulling states that; RESTRICT would block a
-- legitimate removal and a dangling id would name an account that no longer is.
--
-- ⚠️ `public.clients` WAS CREATED OUTSIDE THIS REPO'S MIGRATIONS. Its full policy
-- set is not visible here, so this script writes nothing that depends on one. It
-- adds columns and reads none of the existing policies; see the FLAGS section of
-- supabase/CLIENT-INDUSTRY-WRITER-APPLY.md for what to confirm live before
-- applying.
alter table public.clients
  add column if not exists industry_id uuid references public.industries(id),
  add column if not exists writer_id   uuid references auth.users(id) on delete set null;

-- ============================================================================
-- 3. create_industry — admin-only
-- ============================================================================
--
-- ⚠️ THE `coalesce` AROUND EVERY GUARD IS NOT DECORATION, AND IT GOES AROUND THE
-- COMPARISON, NEVER AROUND A COLUMN.
--
-- In plpgsql `null = x` is NULL, `not NULL` is NULL, and `if NULL then` DOES NOT
-- FIRE — control falls straight through the guard into the write. This repo has
-- already shipped that shape once (see the `uploaded_by` note in
-- supabase/outreach-void.sql). `public.is_admin()` returns `exists(...)`, which is
-- never null TODAY, so today the coalesce changes nothing; it is here so that a
-- future redefinition of `is_admin()` that can return null fails CLOSED instead of
-- opening every write path in this file at once. Wrapping the column instead —
-- `coalesce(role, 'admin') = 'admin'` — would be the same hole written more
-- confidently.
create or replace function public.create_industry(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'industry name is required' using errcode = '22004';
  end if;

  insert into public.industries (name)
    values (trim(p_name))
    returning id into v_id;

  return v_id;
end;
$$;

revoke all     on function public.create_industry(text) from public;
grant  execute on function public.create_industry(text) to authenticated;

comment on function public.create_industry(text) is
  'Admin-only. Adds one row to the industries registry. Raises 42501 for a non-admin caller and 22004 for a blank name. SECURITY DEFINER because public.industries has no write policy at all — the guard lives in this body, not in RLS.';

-- ============================================================================
-- 4. update_industry — admin-only. Renaming here is SAFE, and that is worth saying
-- ============================================================================
--
-- ⚠️ RENAMING AN INDUSTRY IS SAFE PRECISELY BECAUSE NOTHING JOINS ON THE STRING.
-- Clients point at `industries.id`; the text is a label. That is the whole reason
-- D2 chose a registry over free text, and it is the exact opposite of
-- `clients.name`, which IS a join key and is unreachable from this script.
create or replace function public.update_industry(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'industry name is required' using errcode = '22004';
  end if;

  update public.industries
     set name       = trim(p_name),
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'unknown industry %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.update_industry(uuid, text) from public;
grant  execute on function public.update_industry(uuid, text) to authenticated;

comment on function public.update_industry(uuid, text) is
  'Admin-only rename of one industry. Safe by construction: Clients reference industries.id, never the text, so no attribution depends on this value. Raises 42501, 22004 for a blank name, 23503 for an unknown id.';

-- ============================================================================
-- 5. set_industry_status — archive / restore, admin-only
-- ============================================================================
--
-- Archiving is the REVERSIBLE way to retire an industry and is what staff should
-- reach for: every Client already recorded in it keeps its value and keeps
-- reading correctly. Deletion (below) is the irreversible one and is deliberately
-- much harder to do.
create or replace function public.set_industry_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if p_status not in ('active', 'archived') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;

  update public.industries
     set status     = p_status,
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'unknown industry %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.set_industry_status(uuid, text) from public;
grant  execute on function public.set_industry_status(uuid, text) to authenticated;

comment on function public.set_industry_status(uuid, text) is
  'Admin-only archive/restore of one industry. Archiving is reversible and keeps every Client recorded in it intact; prefer it to deletion. Raises 42501, 22023 for an unknown status, 23503 for an unknown id.';

-- ============================================================================
-- 6. delete_industry — admin-only, and refused while any Client is recorded in it
-- ============================================================================
--
-- ⚠️ HARD DELETE IS A TYPO ERASER, NOT A RETIREMENT TOOL. Use archive to retire an
-- industry. This exists only so a row created by mistake, before any Client was
-- recorded in it, can be removed rather than cluttering the registry for ever.
--
-- The count below produces a message a human can act on ("3 clients are still
-- recorded in this industry"). It is NOT what enforces the rule:
-- `clients.industry_id` has no cascade and no set-null, so the foreign key refuses
-- the delete on its own even if this function is bypassed. Two layers, and the one
-- that cannot be skipped is the database's.
create or replace function public.delete_industry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refs bigint;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  select count(*) into v_refs
    from public.clients
   where industry_id = p_id;

  if v_refs > 0 then
    raise exception 'cannot delete: % client(s) are still recorded in this industry', v_refs
      using errcode = '23503';
  end if;

  delete from public.industries where id = p_id;

  if not found then
    raise exception 'unknown industry %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.delete_industry(uuid) from public;
grant  execute on function public.delete_industry(uuid) to authenticated;

comment on function public.delete_industry(uuid) is
  'Admin-only hard delete of one industry, refused while any Client is recorded in it (23503, message names the count). The foreign key on clients.industry_id has no cascade, so the database refuses independently of this function. Prefer set_industry_status archive.';

-- ============================================================================
-- 7. set_client_industry_writer — the ONLY write path onto a Client, admin-only
-- ============================================================================
--
-- ⚠️ THIS FUNCTION IS THE POINT OF THE SLICE, AND WHAT IT CANNOT REACH MATTERS
-- MORE THAN WHAT IT SETS.
--
-- Its UPDATE names exactly two columns. `clients.name` and `clients.linkedin_url`
-- are therefore unreachable BY CONSTRUCTION: public.clients has no update policy,
-- so no caller can write the table directly, and the only function that can does
-- not mention them. Neither identifier appears anywhere inside this function, and
-- supabase/client-industry-writer.test.ts fails if either ever does — as a
-- negative assertion, not a comment, because a comment cannot fail.
--
-- Why that deserves a guard rather than a convention: `clients.name` is the key
-- `bi.linkedin_post_latest` joins scraped posts on. Editing it silently
-- re-attributes or strands every post the Client has.
--
-- ⚠️ BOTH ARGUMENTS ARE APPLIED, INCLUDING NULL. Passing NULL CLEARS the field —
-- that is how "no writer assigned" and "industry not recorded" are expressed. A
-- caller must therefore always send the current value of the field it is not
-- changing; a partial update is impossible through this signature, on purpose.
-- One statement, two columns, atomic.
--
-- ⚠️ AN ARCHIVED INDUSTRY IS STILL ASSIGNABLE, DELIBERATELY. Refusing one here
-- would mean a Client whose industry was archived after assignment could never be
-- saved again — its writer could not be changed without also changing its
-- industry, for a reason no screen could sensibly explain. The picker offers
-- active rows; this function accepts any row the foreign key accepts.
--
-- ⚠️ NOTHING STAMPS AN `updated_at` HERE because public.clients has no such column
-- and this script does not add one. That table is owned outside this repo; see the
-- FLAGS in supabase/CLIENT-INDUSTRY-WRITER-APPLY.md.
create or replace function public.set_client_industry_writer(
  p_client_id   uuid,
  p_industry_id uuid,
  p_writer_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  -- ⚠️ EXACTLY TWO COLUMNS. Adding a third to this statement is the defect the
  -- whole slice exists to prevent — read the block above before touching it.
  update public.clients
     set industry_id = p_industry_id,
         writer_id   = p_writer_id
   where id = p_client_id;

  if not found then
    raise exception 'unknown client %', p_client_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.set_client_industry_writer(uuid, uuid, uuid) from public;
grant  execute on function public.set_client_industry_writer(uuid, uuid, uuid) to authenticated;

comment on function public.set_client_industry_writer(uuid, uuid, uuid) is
  'Admin-only. The ONLY write path onto public.clients. Sets exactly industry_id and writer_id; clients.name and clients.linkedin_url are unreachable through it by construction, because name is the key bi.linkedin_post_latest joins scraped posts on and editing it would silently re-attribute or strand every post the Client has. NULL clears a field, so callers must send both current values. Raises 42501 for a non-admin, 23503 for an unknown client.';

-- ============================================================================
-- 8. list_staff_directory — user_id + email, readable by ANY staff member (D4)
-- ============================================================================
--
-- ⚠️ IT RETURNS TWO COLUMNS AND MUST NEVER RETURN MORE.
--
-- `public.list_staff()` is admin-only and carries the Staff Role, whether that
-- role was assigned or is a least-privilege default, and whether an invitation is
-- still pending. Those are governance facts. If this function returned any of
-- them, the admin-only guard on `list_staff()` would be pointless — an analyst
-- would read the same governance state through the unguarded door. A test asserts
-- that none of those three words appears inside this function.
--
-- ⚠️ `list_staff()` ITSELF IS UNTOUCHED BY THIS SCRIPT. It is not redefined, not
-- dropped, not re-granted. One definition per function, and its definition stays
-- in supabase/staff-roles-admin.sql.
--
-- Why this exists at all: `clients.writer_id` holds an `auth.users.id`, and
-- `auth.users` is NOT readable by the `authenticated` role — so without a definer
-- function a Data Analyst sees a raw uuid where the writer's identity should be.
-- ADR 0013 removes the ability to CHANGE things, never the ability to SEE them, so
-- granting this to every staff member FOLLOWS that principle rather than making a
-- new decision (D4).
--
-- ⚠️ ARCBASE STAFF HAVE NO DISPLAY NAME, so `email` is the readable value and the
-- UI will render `bryan@arcbound.com`. Accepted for now; adding a display name is
-- its own slice.
--
-- ⚠️ THE DROP IS REQUIRED IF THE SHAPE EVER CHANGES, NOT TIDINESS. A `returns
-- table` column list IS the function's return type, and `create or replace` cannot
-- change a return type — Postgres raises 42P13. Dropping also discards the grants,
-- which is why the revoke/grant pair below must run with it, in this same file, as
-- one unit.
drop function if exists public.list_staff_directory();

create or replace function public.list_staff_directory()
returns table (
  user_id uuid,
  email   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Every column is table-qualified: `returns table` declares OUT parameters with
  -- these same identifiers, and an unqualified reference would be ambiguous.
  -- `u.email` is `varchar` in auth.users; the cast to `text` is required or the
  -- returned row type will not match this signature.
  return query
    select u.id,
           u.email::text
      from auth.users u
     order by u.email;
end;
$$;

revoke all     on function public.list_staff_directory() from public;
grant  execute on function public.list_staff_directory() to authenticated;

comment on function public.list_staff_directory() is
  'Staff directory readable by ANY authenticated staff member: user_id and email, nothing else. SECURITY DEFINER because auth.users is not readable by the authenticated role, which is what otherwise leaves a Data Analyst looking at a raw uuid for a Client writer. Deliberately carries no Staff Role, no assignment state and no invitation state — list_staff() is the admin-only function that carries those, and repeating them here would make its guard pointless (ADR 0013, D4).';

-- ============================================================================
-- 9. VERIFICATION — ⚠️ RUN THESE ONE AT A TIME
-- ============================================================================
--
-- ⚠️ ONE AT A TIME, EACH IN ITS OWN QUERY. The Supabase SQL editor shows only the
-- LAST statement's result set, so pasting these together silently discards every
-- result above the final one — a check that returned nothing looks exactly like a
-- check you never ran.
--
--   (a) The registry exists and is empty. MUST return 0 — this script seeds
--       nothing, and a non-zero count here means it was applied before:
--
--         select count(*) from public.industries;
--
--   (b) Both columns landed on public.clients, nullable, with the right types.
--       MUST return exactly two rows, both is_nullable = YES:
--
--         select column_name, data_type, is_nullable
--           from information_schema.columns
--          where table_schema = 'public' and table_name = 'clients'
--            and column_name in ('industry_id', 'writer_id');
--
--   (c) ⚠️ THE DELETE BEHAVIOUR, WHICH IS THE HALF THAT CANNOT BE READ OFF THE
--       COLUMN LIST. `writer_id` MUST be 'n' (SET NULL) and `industry_id` MUST be
--       'a' (NO ACTION). If industry_id came back 'c' or 'n', the delete guard is
--       decorative and an in-use industry can be destroyed:
--
--         select conname, confdeltype
--           from pg_constraint
--          where conrelid = 'public.clients'::regclass and contype = 'f';
--
--   (d) The six functions exist and are all SECURITY DEFINER (prosecdef = true).
--       MUST return six rows:
--
--         select proname, prosecdef, provolatile from pg_proc
--          where pronamespace = 'public'::regnamespace
--            and proname in ('create_industry','update_industry',
--                            'set_industry_status','delete_industry',
--                            'set_client_industry_writer','list_staff_directory');
--
--   (e) ⚠️ THE ONE THAT MATTERS MOST. The only write path onto public.clients must
--       still be unable to reach the attribution key. MUST return ZERO rows:
--
--         select proname from pg_proc
--          where pronamespace = 'public'::regnamespace
--            and proname = 'set_client_industry_writer'
--            and (prosrc ilike '%linkedin_url%' or prosrc ~* '\mname\M');
--
--   (f) RLS is on for the registry, with exactly one SELECT-only policy
--       (polcmd = 'r'). MUST return true, then exactly one row:
--
--         select relrowsecurity from pg_class where relname = 'industries';
--         select polname, polcmd from pg_policy
--          where polrelid = 'public.industries'::regclass;
--
--   (g) ⚠️ THE POLICY SET ON public.clients MUST BE UNCHANGED — this script adds
--       no UPDATE policy and must not have acquired one. Expect the same rows as
--       before applying: an INSERT policy and a SELECT policy, and NO 'w' row:
--
--         select polname, polcmd from pg_policy
--          where polrelid = 'public.clients'::regclass;
--
--   (h) Nothing is granted to anon. MUST return 0 rows:
--
--         select grantee, privilege_type
--           from information_schema.role_table_grants
--          where table_name = 'industries' and grantee = 'anon';
--
--   (i) The directory reads, and returns exactly two columns:
--
--         select * from public.list_staff_directory();
--
--   With one staff account that is one row. Two columns, user_id and email — if
--   you see a role, an assignment flag or a pending flag, STOP: the admin-only
--   guard on list_staff() has been made pointless.
