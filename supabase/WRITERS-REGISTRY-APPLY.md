# Applying the ArcBase writers registry

This SQL turns **Writer** from a Supabase login into a registry of people, the
way **Industry** already is. It creates `public.writers`, seeds the four writers
Arcbound named, moves `clients.writer_id`'s foreign key off `auth.users` and onto
`public.writers`, and adds four admin functions.

Applying it needs **your** Supabase auth, so you run it — the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`).

---

## ⚠️ Read this before you run anything

**One statement in this script can fail, and it is the foreign-key swap.**

`clients.writer_id` currently references `auth.users(id)`. The ids in
`auth.users` and `public.writers` are unrelated, so any Client that already has a
writer recorded holds an id that names **no row in the new table**. The script
therefore **refuses** in that case rather than guessing — it will not null those
values "to be safe", because somebody typed them in and a script is not entitled
to decide they did not mean it.

**Step 1 below is how you find out, before you apply anything.**

⚠️ **A count nobody has seen is not a count.** On 2026-08-18 this repo lost
fourteen posts to a staging repair that was believed applied and had never run.
Run step 1, read the number, and only then continue.

**Nothing in this script has ever run.** ArcBase's test suite has no database in
it — `supabase/writers-registry.test.ts` reads the text of the script and checks
it still says what it is meant to say. The verification queries below are the
first time any of it executes.

---

## 1. ⚠️ Before anything: how many Clients have a writer?

Run this **first**, in its own query, and keep the result.

```sql
select count(*) as clients_with_a_writer
  from public.clients
 where writer_id is not null;
```

**If it is `0`** — continue to Apply.

⚠️ **Do not assume it will be `0`.** Two shipped screens can set a writer under
the old model: the Add-Client dialog's picker and the Industry & writer card on
`/clients/[id]`. Any Client an admin has already assigned holds an `auth.users`
id, and that is precisely the case this step exists to find. Read the number.

**If it is anything else, STOP.** Those values are `auth.users` ids under the old
model. Decide, per Client, who the writer should be in the new registry; write
that decision down; clear the column deliberately; then apply. The script's guard
will refuse until the count is zero, so nothing can slip through — but the guard
is a backstop, not the plan.

To see which ones, before you decide:

```sql
select id, name, writer_id
  from public.clients
 where writer_id is not null
 order by name;
```

---

## Apply

**Option A — SQL editor (the working path).** Dashboard → **SQL Editor** → **New
query** → paste all of **`supabase/writers-registry.sql`** → **Run**.

Expected result: the last statement is a `select`, so you should see **4 rows**
— Courtney Taylor, Izzy Bailey, Ryan Prior, Siddharth Kumar — every one `active`.

If instead you get
`refusing to swap clients.writer_id: N client(s) still reference auth.users`,
the guard fired. **Nothing was changed.** Go back to step 1.

**Option B — CLI.** ⚠️ **Not recommended for this project.** `supabase db push`
would apply `migrations/20260818140000_writers_registry.sql`, which contains the
identical SQL (`supabase/sql-sync.test.ts` keeps the two files in step). But
`public.clients` was created outside this repo's migrations, so the CLI's picture
of the schema is not the live one — and this script **drops a constraint** on that
table. Use Option A.

The script is **safe to re-run**: the table uses `create table if not exists`, the
seed uses `on conflict do nothing`, the constraint is dropped `if exists`, and
every function is `create or replace`. The one exception is the `add constraint`,
which errors on a second run because the constraint already exists — harmless, and
it happens after everything else has already succeeded.

---

## Verify — ⚠️ run these ONE AT A TIME

The Supabase SQL editor shows **only the last statement's result**. Paste these
together and every result but the final one is silently discarded, which looks
exactly like a check you ran and passed.

### 1. The four writers landed

```sql
select name, status from public.writers order by name;
```

**Expect: 4 rows**, every one `active`.

### 2. ⚠️ The foreign key points at the registry, and does NOT set null

```sql
select conname, confrelid::regclass as references, confdeltype
  from pg_constraint
 where conrelid = 'public.clients'::regclass
   and contype = 'f'
   and conname = 'clients_writer_id_fkey';
```

**Expect: one row** — `references = public.writers`, `confdeltype = 'a'`
(NO ACTION).

⚠️ **If `confrelid` still says `auth.users`, the swap did not happen** and every
screen will still be on the old model. ⚠️ **If `confdeltype` is `n` (SET NULL),
the protection is decorative**: deleting one writer would silently unassign every
Client recorded against them. Report either.

### 3. The four functions exist and run as their owner

```sql
select proname, prosecdef from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('create_writer','update_writer','set_writer_status','delete_writer');
```

**Expect: four rows, every `prosecdef = true`.**

### 4. The registry is read-only to everyone except the functions

```sql
select polname, polcmd from pg_policy
 where polrelid = 'public.writers'::regclass;
```

**Expect: exactly one row**, `polcmd = 'r'` (SELECT).

```sql
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'writers' and grantee = 'anon';
```

**Expect: zero rows.**

### 5. ⚠️ `public.clients`'s policy set is unchanged

```sql
select polname, polcmd from pg_policy
 where polrelid = 'public.clients'::regclass;
```

**Expect: the same two rows as before** — one `'a'` (INSERT), one `'r'` (SELECT),
and **still no `'w'` (UPDATE)**. This script adds, removes and edits no policy;
any difference means it did something it was not supposed to.

---

## ⚠️ After applying: reload PostgREST, then load `/clients` once

The script ends with `notify pgrst, 'reload schema';`, which is normally enough.
**Confirm it took effect by opening `/clients` in the app.**

This matters more than it looks. W2 adds `writer:writers(id, name)` to the client
`SELECT` as a PostgREST embed. Until PostgREST's cached picture of the foreign
keys includes the new constraint, that embed **404s and the whole select throws**
— and `getClient` is not only a display read. The upload name-match gate calls it
before every write, and `checkAuthorNames` **catches a throw and degrades to
"could not check"**, letting an upload proceed without the check that exists
because fourteen posts were lost to a name mismatch.

So: apply → confirm `/clients` renders with writers → only then trust an upload.
No test in this repo can cover this; it is a live-only check.

---

## ⚠️ FLAGS — confirm these live, and report anything that does not match

1. **The old constraint's name is assumed to be `clients_writer_id_fkey`** —
   Postgres's default for a column-level reference. If `client-industry-writer.sql`
   was applied in a way that named it differently, the `drop constraint if exists`
   is a no-op and the `add constraint` then fails on a duplicate name. Check with
   the step-2 query before applying if you want certainty.
2. **`public.list_staff_directory()` is now orphaned but deliberately NOT dropped
   here.** Shipped code still calls it. It is dropped in W2, after its last
   caller — dropping it in this script would break `src/services/clients.ts`
   between two deploys.
3. **Nothing here has been executed.** Every claim in this runbook about what a
   statement will do is derived from reading the SQL, not from having run it.
