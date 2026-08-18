# Applying the ArcBase Client Industry + Writer schema

This SQL gives a Client its **first two mutable fields** — an Industry and a
Writer — and gives Arcbound an admin-managed `public.industries` list to choose
the Industry from. It also adds `public.list_staff_directory()`, so a Data Analyst
sees a colleague's email where a Client's writer is, instead of a raw uuid.

It is **additive only**. It creates one table, adds two **nullable** columns to
`public.clients`, and creates six functions. It drops nothing, alters nothing that
already exists, and **adds no policy to `public.clients`**. `public.list_staff()`,
the `bi.*` views, and `public.linkedin_posts_staging` are untouched.

Applying it needs **your** Supabase auth, so you run it — the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`).

---

## ⚠️ Read this before you run anything

**A Client's name is how their posts find them.** The reporting view
`bi.linkedin_post_latest` matches a scraped post to a Client by comparing the
scraped author name to `clients.name`, exactly. Change a Client's name and every
post that person has silently attaches to nobody — which is precisely what lost
fourteen of Eitan Hoenig's posts on 2026-08-18.

So this script is written so that **nothing it adds can reach that column.** There
is still no update policy on `public.clients`, which means nobody can edit that
table directly; the only thing that can write to it is
`set_client_industry_writer`, and that function names exactly two columns —
`industry_id` and `writer_id`. Step 3 of **Verify** below is how you confirm that
is still true on the live database.

**Nothing in this script has ever run.** ArcBase's test suite has no database in
it. The tests read the text of the script and check it still says what it is meant
to say; they cannot tell you it works. The verification queries below are the
first time any of it executes.

---

## Apply

**Option A — SQL editor (the working path).** Dashboard → **SQL Editor** → **New
query** → paste all of **`supabase/client-industry-writer.sql`** → **Run**.

Expected result: `Success. No rows returned.`

**Option B — CLI.** ⚠️ **Not recommended for this project.** `supabase db push`
would apply `migrations/20260818120000_client_industry_writer.sql`, which contains
the identical SQL (a test keeps the two files in step). But `public.clients` was
created outside this repo's migrations, so the CLI's picture of the schema is not
the live one, and a migration-timestamp ordering trap has bitten this repo before.
Use Option A.

The script is **safe to re-run**: the table uses `create table if not exists`, the
columns use `add column if not exists`, the policy is dropped and recreated, and
every function is `create or replace`.

---

## ⚠️ Before you run it — take one snapshot

Run this **first**, in its own query, and keep the result. It is the only way to
prove afterwards that the script left `public.clients`'s permissions alone.

```sql
select polname, polcmd from pg_policy
 where polrelid = 'public.clients'::regclass;
```

**Expect: two rows** — one `polcmd = 'a'` (the INSERT policy, `arcbase add
clients`) and one `polcmd = 'r'` (the SELECT policy, `arcbase read clients`).

⚠️ **If you see a row with `polcmd = 'w'` (UPDATE), STOP and report it.** That
means something outside this repo already granted a direct update path to
`public.clients`, and the guarantee above — that a Client's name is unreachable —
does not hold. Do not apply the script until that is understood.

---

## Verify — ⚠️ run these ONE AT A TIME

The Supabase SQL editor shows **only the last statement's result**. Paste these
together and every result but the final one is silently discarded, which looks
exactly like a check you ran and passed. Run each in its own query.

### 1. The registry exists and is empty

```sql
select count(*) from public.industries;
```

**Expect: `0`.** This script deliberately seeds no industries — which ones
Arcbound recognises has not been decided, and a guessed list would be
indistinguishable from a decision once it was in the table. Admins add them.

A number other than `0` means the script has been applied before. That is fine and
harmless; just note it.

### 2. Both columns landed, and both are nullable

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'clients'
   and column_name in ('industry_id', 'writer_id');
```

**Expect: exactly two rows**, both `data_type = uuid`, both `is_nullable = YES`.

Nullable is correct: every Client that already exists gets `NULL` for both,
meaning **not recorded yet** — not "none". Nothing backfills them, because there
is no evidence anywhere in the database from which either could be worked out.

### 3. ⚠️ The write path still cannot reach the attribution key

**This is the one that matters most.**

```sql
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'set_client_industry_writer'
   and (prosrc ilike '%linkedin_url%' or prosrc ~* '\mname\M');
```

**Expect: zero rows.**

One row means the live function mentions `name` or `linkedin_url` somewhere in its
body. **Stop and report it.** Whatever else is true, an edit path onto a Client's
name exists, and using it will strand that Client's posts with nothing on screen to
explain why.

### 4. The delete behaviour of the two new foreign keys

```sql
select conname, confdeltype
  from pg_constraint
 where conrelid = 'public.clients'::regclass and contype = 'f';
```

**Expect** the constraint on `writer_id` to show `confdeltype = 'n'` (SET NULL) and
the one on `industry_id` to show `confdeltype = 'a'` (NO ACTION).

Why each is what it is:

- `writer_id` → **`n`**. The writer link is _current state_ — "who writes for them
  now" — not history. If a staff account is deleted in the dashboard, the honest
  answer becomes "nobody", and the audit trail of who uploaded what lives
  elsewhere, in `uploads.uploaded_by`.
- `industry_id` → **`a`**. This is what makes the "you can't delete an industry
  someone is in" rule real. The database refuses on its own, so the rule survives
  even if someone bypasses the app entirely. ⚠️ **If this comes back `c` or `n`,
  that protection is decorative** and an industry in use can be destroyed — report
  it.

### 5. All six functions exist and run as their owner

```sql
select proname, prosecdef, provolatile from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('create_industry','update_industry',
                   'set_industry_status','delete_industry',
                   'set_client_industry_writer','list_staff_directory');
```

**Expect: six rows, every `prosecdef = true`.** `list_staff_directory` should show
`provolatile = 's'` (stable); the rest `'v'` (volatile).

### 6. The registry is read-only to everyone except the functions

```sql
select relrowsecurity from pg_class where relname = 'industries';
```

**Expect: `true`.**

```sql
select polname, polcmd from pg_policy
 where polrelid = 'public.industries'::regclass;
```

**Expect: exactly one row**, `polcmd = 'r'` (SELECT). There is deliberately no
insert, update or delete policy — every write goes through an admin-guarded
function, so an analyst cannot write here even with a valid session and their own
Supabase token.

### 7. Nothing is exposed to logged-out visitors

```sql
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'industries' and grantee = 'anon';
```

**Expect: zero rows.**

### 8. ⚠️ `public.clients`'s permissions are unchanged

Re-run the snapshot query from before you applied:

```sql
select polname, polcmd from pg_policy
 where polrelid = 'public.clients'::regclass;
```

**Expect: exactly the rows you recorded earlier** — same names, same commands, and
**still no `w` (UPDATE) row.** Any difference means the script did something it was
not supposed to; report it.

### 9. The staff directory reads

```sql
select * from public.list_staff_directory();
```

**Expect: two columns — `user_id` and `email` — and one row per staff account.**
With a single staff account that is one row.

⚠️ **If you see a role, an "assigned" flag or a "pending" flag, stop and report
it.** Those belong to `list_staff()`, which is admin-only; repeating them here
would hand every analyst the governance information that guard exists to protect.

---

## Then: add some industries

The list starts empty, so until an admin adds rows there is nothing to pick. There
is no admin screen yet — that is a later slice — so for now, from the SQL editor:

```sql
select public.create_industry('SaaS');
```

**Expect: one row containing a uuid.**

⚠️ Calling this from the SQL editor **will fail** with `admin role required`
(`42501`), because in the SQL editor there is no logged-in ArcBase user for
`is_admin()` to recognise. That refusal is the guard working correctly, not a
fault. To seed rows from the editor, insert directly instead — the editor's role
bypasses RLS:

```sql
insert into public.industries (name) values ('SaaS')
on conflict do nothing;
```

Then confirm with `select id, name, status from public.industries order by name;`.

⚠️ Names are unique **case-insensitively**: `SaaS` and `saas` cannot both exist.
That is on purpose — the whole reason for a controlled list is that
"how many clients in SaaS" has one answer.

---

## After applying

- Nothing changes in the app yet. This slice is schema only: no service reads
  these columns and no screen shows them. The read path, the pickers and the
  Client-list columns are separate slices (S2–S4 in the decision record).
- Every existing Client shows no industry and no writer, because both are `NULL`.
  That is "not recorded yet", and it is accurate.
- The client-facing report at `/r/[token]` is deliberately unaffected — neither
  field ever reaches it (D3).
- Optionally run `pnpm db:types` to regenerate
  `src/lib/supabase/database.types.ts`.

---

## ⚠️ FLAGS — confirm these live, and report anything that does not match

These are the things the agent that wrote this script **could not see** from the
repo, listed so they are checked rather than assumed.

1. **`public.clients`'s full policy set is invisible to this repo.** The table was
   created outside these migrations, so only two of its policies are documented
   here (`arcbase add clients`, `arcbase read clients`). The snapshot before
   applying and step 8 after are the checks. ⚠️ **An existing UPDATE policy would
   void this slice's central guarantee** — that a Client's name cannot be edited —
   because a policy grants direct table access and no policy predicate can stop a
   caller choosing which column to write.
2. **`public.clients` is assumed to have no `updated_at`.** Nothing in this script
   stamps one, so if that column does exist it will quietly go stale on every
   industry/writer change. Confirm with the step 2 query, widened to `select
column_name from information_schema.columns where table_name = 'clients'`, and
   report if `updated_at` is there.
3. **`gen_random_uuid()` is assumed available.** `public.services` already uses it
   on this database, so it should be; if `create table` fails on it, that
   assumption was wrong.
4. **The `bi.linkedin_post_latest` join was read on 2026-08-18** and is quoted in
   the script's header. It lives in a view this repo does not own. If it has since
   changed, the reasoning about why `clients.name` is untouchable still holds, but
   the quoted DDL is stale.
5. **The industries list is empty and there is no admin screen for it yet.** Until
   rows are added by hand, S3's picker will have nothing to offer.
6. **Nothing here has been executed.** Every claim in this runbook about what a
   statement will do is derived from reading the SQL, not from having run it. The
   verification steps are the first execution.
