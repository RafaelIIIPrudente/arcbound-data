-- ArcBase WRITERS REGISTRY — the CLI migration copy.
--
-- Twin of supabase/writers-registry.sql; the SQL in the two files is identical and
-- supabase/sql-sync.test.ts fails if they drift. Timestamped AFTER
-- 20260818120000_client_industry_writer.sql, whose `clients.writer_id` foreign key
-- this one replaces, and after 20260818130000_industries_seed.sql.
--
-- ⚠️ APPLIED BY STAFF THROUGH THE SUPABASE SQL EDITOR USING THE TWIN SCRIPT, NEVER
-- BY `db push`. `public.clients` was created outside this repo's migrations, so the
-- CLI's picture of the schema is not the live one, and this file drops a constraint
-- on that table. See supabase/WRITERS-REGISTRY-APPLY.md.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ THIS SCRIPT ALTERS WHAT supabase/client-industry-writer.sql BUILT.
--
-- That script IS APPLIED to the live database and must not be edited — editing an
-- applied script makes the file and the database disagree with no way to tell
-- which is which. This is a separate, later pair that changes one thing that
-- script got wrong.
--
-- WHAT IT GOT WRONG: `clients.writer_id` was made `references auth.users(id)`, so
-- recording who writes for a Client required ISSUING THAT PERSON A LOGIN — and
-- under ADR 0013 every logged-in analyst reads EVERY Client. CONTEXT.md's glossary
-- already said a Writer "grants no access and withholds none". The schema
-- contradicted the glossary: it forced a credential and a full read grant for a
-- fact about authorship. Asked for four real writers — Ryan Prior, Courtney
-- Taylor, Izzy Bailey, Siddharth Kumar — no migration could add them, because they
-- are people and the column wanted accounts.
--
-- A Writer becomes what an Industry already is: a row in a small admin-managed
-- registry, joined by id, carrying a name and nothing else.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NOTHING BELOW HAS EVER EXECUTED IN CI. No Postgres runs in this repo's test
-- suite; supabase/writers-registry.test.ts asserts on the TEXT of this file. It
-- proves the script still SAYS what it is supposed to say, never that it works.
-- The guards, the FK swap and the delete refusal are unverified until applied.

-- ============================================================================
-- 1. writers — the registry of people who write for Clients (D15)
-- ============================================================================
--
-- An exact mirror of public.industries: readable by every authenticated staff
-- member, written ONLY through the SECURITY DEFINER functions below.
--
-- ⚠️ A ROW HERE IS NOT AN ACCOUNT AND GRANTS NOTHING. There is no join to
-- auth.users, no email, and no way for a row in this table to become a login.
-- That is the entire point of the change: authorship is an attribution, and
-- attribution must not require a credential.
create table if not exists public.writers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  -- ⚠️ NO TRIGGER MAINTAINS THIS. Every mutating function below sets it
  -- explicitly; omitting it there leaves the column quietly lying about a row
  -- that genuinely changed.
  updated_at timestamptz not null default now(),

  constraint writers_status_known check (status in ('active', 'archived'))
);

-- ⚠️ THE PLAIN `unique` ABOVE IS NOT ENOUGH, AND THIS INDEX IS WHY. `unique` on
-- the column rejects only an exact repeat, so "Ryan Prior" and "ryan prior" can
-- both exist and a Client's writer becomes two people who are one person.
--
-- ⚠️ BUT PERSON NAMES COLLIDE WHERE INDUSTRY NAMES DO NOT, AND THAT DIFFERENCE IS
-- REAL. There is exactly one "Tech"; there can genuinely be two people called Ryan
-- Prior. This index will refuse the second one, and that refusal is CORRECT: a
-- registry whose entries cannot be told apart is useless, and two identical rows
-- would put an unanswerable question on every screen that shows a writer. The
-- answer is a human making the name distinguishable at that moment — "Ryan Prior
-- (Content)", a middle initial, whatever Arcbound actually calls them — never a
-- silent second row that looks the same and means someone else.
create unique index if not exists writers_name_ci
  on public.writers (lower(name));

alter table public.writers enable row level security;

-- Readable by any authenticated staff member; written ONLY through the SECURITY
-- DEFINER functions below (the definer owner bypasses RLS). No insert/update/
-- delete policy exists, so there is no route by which a non-admin can write here
-- even with a valid session and their own Supabase token.
drop policy if exists writers_select_authenticated on public.writers;
create policy writers_select_authenticated on public.writers
  for select to authenticated using (true);

-- ============================================================================
-- 2. Seed the four writers Arcbound named
-- ============================================================================
--
-- ⚠️ SEEDED BEFORE THE FOREIGN KEY MOVES, AND THAT ORDER MATTERS. The swap below
-- refuses if any Client already points at something; seeding first means the
-- registry is populated and usable the moment the swap lands, rather than leaving
-- a window where the column exists and there is nothing legal to put in it.
--
-- ⚠️ IDEMPOTENT. `on conflict do nothing` with no target covers BOTH uniqueness
-- rules: the plain `unique` on `name` and the case-insensitive `writers_name_ci`
-- index on `lower(name)`. Re-running changes nothing and errors on nothing.
insert into public.writers (name)
values
  ('Courtney Taylor'),
  ('Izzy Bailey'),
  ('Ryan Prior'),
  ('Siddharth Kumar')
on conflict do nothing;

-- ============================================================================
-- 3. ⚠️ THE FOREIGN KEY SWAP — the only risky statement in this file
-- ============================================================================
--
-- `clients.writer_id` currently references auth.users(id). It must reference
-- public.writers(id). The ids in those two tables are unrelated, so an existing
-- non-null `writer_id` is an auth.users id that names no writer — and adding the
-- new constraint over it would fail, or worse, be added `not valid` by a later
-- hand and quietly point at nothing.
--
-- ⚠️ SO THIS REFUSES RATHER THAN GUESSES. If any Client has a writer recorded
-- under the old model, the swap raises and nothing changes. The alternative —
-- nulling them "to be safe" — is data loss wearing a default: somebody typed
-- those in, and a script is not entitled to decide they did not mean it.
--
-- ⚠️ IF THIS RAISES: read the count, decide what those writers should be in the
-- new registry, null them deliberately, then re-run. The runbook's step 1 exists
-- so the count is SEEN before anything is applied. This repo lost fourteen posts
-- to a repair believed applied whose row count nobody had looked at.
do $$
declare
  v_assigned bigint;
begin
  select count(*) into v_assigned from public.clients where writer_id is not null;

  if v_assigned > 0 then
    raise exception
      'refusing to swap clients.writer_id: % client(s) still reference auth.users. Decide what each should be in public.writers, clear them deliberately, then re-run.',
      v_assigned
      using errcode = '23503';
  end if;
end;
$$;

-- The old constraint's name is Postgres's default for a column-level reference
-- (`<table>_<column>_fkey`). Dropped `if exists` so a re-run is harmless.
alter table public.clients
  drop constraint if exists clients_writer_id_fkey;

-- ⚠️ `no action` — NOT `on delete set null`, WHICH IS WHAT S1 HAD.
--
-- Under the old model that default was defensible: deleting an auth.users row was
-- a real administrative act performed elsewhere, and "nobody" was then the honest
-- answer. Under a registry it is not. `set null` would mean deleting one writer
-- row silently unassigns every Client that writer was recorded against — data loss
-- wearing a default, with no error and nothing on screen to explain it.
--
-- NO ACTION makes `delete_writer`'s guard REAL: a writer any Client is recorded
-- against cannot be deleted even if the function is bypassed entirely. The
-- function raises a friendlier message naming the count; the database refuses on
-- its own. Exactly the reasoning behind `clients.industry_id`.
alter table public.clients
  add constraint clients_writer_id_fkey
  foreign key (writer_id) references public.writers(id);

-- ============================================================================
-- 4. create_writer — admin-only
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
-- opening every write path in this file at once.
create or replace function public.create_writer(p_name text)
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
    raise exception 'writer name is required' using errcode = '22004';
  end if;

  insert into public.writers (name)
    values (trim(p_name))
    returning id into v_id;

  return v_id;
end;
$$;

revoke all     on function public.create_writer(text) from public;
grant  execute on function public.create_writer(text) to authenticated;

comment on function public.create_writer(text) is
  'Admin-only. Adds one row to the writers registry. Raises 42501 for a non-admin caller and 22004 for a blank name. A writer row is an attribution, not an account: it grants no access and withholds none.';

-- ============================================================================
-- 5. update_writer — admin-only. Renaming here is SAFE, and that is worth saying
-- ============================================================================
--
-- ⚠️ RENAMING A WRITER IS SAFE PRECISELY BECAUSE NOTHING JOINS ON THE STRING.
-- Clients point at `writers.id`; the text is a label. That is the exact opposite
-- of `clients.name`, which IS a join key and is unreachable from this script.
--
-- It is also the answer to the name-collision problem above: a second Ryan Prior
-- is handled by renaming one of them to something a human can tell apart, and no
-- attribution moves when that happens.
create or replace function public.update_writer(p_id uuid, p_name text)
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
    raise exception 'writer name is required' using errcode = '22004';
  end if;

  update public.writers
     set name       = trim(p_name),
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'unknown writer %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.update_writer(uuid, text) from public;
grant  execute on function public.update_writer(uuid, text) to authenticated;

comment on function public.update_writer(uuid, text) is
  'Admin-only rename of one writer. Safe by construction: Clients reference writers.id, never the text, so no attribution depends on this value. Raises 42501, 22004 for a blank name, 23503 for an unknown id.';

-- ============================================================================
-- 6. set_writer_status — archive / restore, admin-only
-- ============================================================================
--
-- Archiving is the REVERSIBLE way to retire a writer and is what staff should
-- reach for: every Client already recorded against them keeps its value and keeps
-- reading correctly. It is the right tool when somebody leaves — the history of
-- who wrote for whom stays true. Deletion (below) is the irreversible one and is
-- deliberately much harder to do.
create or replace function public.set_writer_status(p_id uuid, p_status text)
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

  update public.writers
     set status     = p_status,
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'unknown writer %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.set_writer_status(uuid, text) from public;
grant  execute on function public.set_writer_status(uuid, text) to authenticated;

comment on function public.set_writer_status(uuid, text) is
  'Admin-only archive/restore of one writer. Archiving is reversible and keeps every Client recorded against them intact; prefer it to deletion, including when someone leaves. Raises 42501, 22023 for an unknown status, 23503 for an unknown id.';

-- ============================================================================
-- 7. delete_writer — admin-only, and refused while any Client is recorded against
-- ============================================================================
--
-- ⚠️ HARD DELETE IS A TYPO ERASER, NOT A RETIREMENT TOOL. Use archive to retire a
-- writer, including when they leave. This exists only so a row created by mistake,
-- before any Client was recorded against it, can be removed rather than cluttering
-- the registry for ever.
--
-- The count below produces a message a human can act on ("3 client(s) are still
-- recorded against this writer"). It is NOT what enforces the rule: the foreign
-- key added above is NO ACTION, so the database refuses the delete on its own even
-- if this function is bypassed. Two layers, and the one that cannot be skipped is
-- the database's.
create or replace function public.delete_writer(p_id uuid)
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
   where writer_id = p_id;

  if v_refs > 0 then
    raise exception 'cannot delete: % client(s) are still recorded against this writer', v_refs
      using errcode = '23503';
  end if;

  delete from public.writers where id = p_id;

  if not found then
    raise exception 'unknown writer %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.delete_writer(uuid) from public;
grant  execute on function public.delete_writer(uuid) to authenticated;

comment on function public.delete_writer(uuid) is
  'Admin-only hard delete of one writer, refused while any Client is recorded against them (23503, message names the count). The foreign key on clients.writer_id is NO ACTION, so the database refuses independently of this function. Prefer set_writer_status archive.';

-- ============================================================================
-- 8. ⚠️ PostgREST must be told the schema changed
-- ============================================================================
--
-- The new embed `writer:writers(id, name)` is resolved from PostgREST's cached
-- picture of the foreign keys. Until that cache is reloaded the embed 404s, and
-- the client SELECT that carries it THROWS — which is not only a broken Client
-- list: `getClient` feeds the upload name-match gate, and `checkAuthorNames`
-- catches a throw and degrades to "could not check", letting an upload proceed
-- without the check that exists because fourteen posts were lost to a mismatch.
notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION — ⚠️ run these ONE AT A TIME. See supabase/WRITERS-REGISTRY-APPLY.md
-- ============================================================================
--
-- Expect EXACTLY 4 rows, every one `active`.
select name, status, created_at
  from public.writers
 order by name;
