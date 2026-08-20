# Applying ArcBase posts ownership (ADR 0010, slice S1)

This SQL gives ArcBase its own typed `public.posts` table whose attribution is a
real foreign key to `public.clients`, stamped at upload from the Client **you**
selected — not from matching a scraped author string. It also replaces
`ingest_metrics` with a **dual-write** version and adds a one-time historical
backfill.

Applying it needs **your** Supabase auth, so you run it — the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`).

---

## ⚠️ Read this before you run anything

**Nothing you currently look at changes.** The staging write stays byte-for-byte
what it is today, `bi.*` keeps serving every screen, and `public.posts` is
populated but read by nothing. That is deliberate: this slice is safe to sit in
indefinitely, and backing out means ceasing to use a table nobody queries.
Repointing the reads is **S2**, a later pair.

**Nothing is dropped.** No view, table, or function belonging to anyone else is
touched. `public.linkedin_posts_staging` gains no column, key, or constraint.

⚠️ **Nothing in this script has ever run.** ArcBase's test suite has no Postgres
in it — `supabase/sql-sync.test.ts` compares the characters in two files and
nothing more. Every claim below about what a statement will do is derived from
reading the SQL. **The counts you read are the first real verification.**

⚠️ **A count nobody has seen is not a count.** On 2026-08-18 this repo lost
fourteen posts to a staging repair that was believed applied and had never run.
Run the pre-flight queries, read the numbers, and only then continue.

---

## 0. ⚠️ Two earlier pairs go in FIRST

Both were still outstanding when this was written and both sort before it:

1. **`supabase/writers-registry.sql`** — apply BEFORE the code deploys.
2. **`supabase/drop-staff-directory.sql`** — apply AFTER the code deploys.

Runbook: `supabase/WRITERS-REGISTRY-APPLY.md`. Nothing in _this_ script depends
on them, but this one adds the table the whole analytics cutover stands on, and
it should land on a database whose state is known. Confirm with:

```sql
select to_regclass('public.writers') as writers_exists,
       to_regproc('public.list_staff_directory') as staff_directory_still_there;
```

Expect `writers_exists = writers` and `staff_directory_still_there = NULL`.

---

## 1. ⚠️ Pre-flight — read these four numbers and WRITE THEM DOWN

Run each as its own query. You are going to compare the backfill's output
against them.

```sql
select count(*) as staging_rows_total from public.linkedin_posts_staging;
```

```sql
select count(*) as staging_distinct_posts
  from public.linkedin_posts_staging
 where linkedin_post_id is not null and btrim(linkedin_post_id) <> '';
```

```sql
-- What bi.* attributes TODAY. This is the number `posts` must match.
select count(*) as bi_attributed_rows from bi.linkedin_post_latest;
```

```sql
-- Who will be SKIPPED, and why. These are real posts that are invisible in
-- every report right now — this is the first time their size is measurable.
select l.post_name,
       trim(regexp_replace(l.post_name, '\s*•\s*You\s*$', '', 'i')) as cleaned,
       count(*) as posts
  from public.linkedin_posts_staging l
 where not exists (
   select 1 from public.clients c
    where c.name = trim(regexp_replace(l.post_name, '\s*•\s*You\s*$', '', 'i'))
 )
 group by 1, 2
 order by posts desc;
```

⚠️ **Expect Eitan Hoenig's 14 posts in that last result** (author label
`Eitan Hoenig Eitan Hoenig • You Premium • You`). If they are NOT there, the
staging repair from 2026-08-18 changed something and the rest of this runbook's
numbers will not line up — stop and say so.

---

## Apply

**Option A — SQL editor (the working path).** Dashboard → **SQL Editor** → **New
query** → paste all of **`supabase/posts-ownership.sql`** → **Run**.

Expected result: the last statement is a `select`, so you should see **one row**:

| column              | expect                                     |
| ------------------- | ------------------------------------------ |
| `posts_rows`        | **0** — the table exists and is empty      |
| `staging_rows`      | the same number as pre-flight query 1      |
| `posts_policies`    | **1** (one SELECT policy, no write policy) |
| `functions_present` | **4**                                      |

**Option B — CLI.** ⚠️ **Not recommended for this project.** `supabase db push`
would apply `migrations/20260819120000_posts_ownership.sql`, which contains the
identical SQL (`supabase/sql-sync.test.ts` keeps the two in step). But
`public.clients` and `public.linkedin_posts_staging` were created outside this
repo's migrations, so the CLI's picture of the schema is not the live one — and
this migration adds a foreign key onto `public.clients`. Use Option A.

The script is **safe to re-run**: the table uses `create table if not exists`,
every policy is dropped `if exists` first, every index is `if not exists`, and
every function is `create or replace`.

⚠️ **`ingest_metrics` is REPLACED, not dropped-and-recreated.** Its signature is
unchanged, so there is no window in which uploads have no function to call. If
you see `ERROR: function name is not unique`, an old overload survived from an
earlier migration — stop and report it rather than dropping anything.

---

## 2. Run the backfill — and READ THE FIVE NUMBERS

Its own query, on its own:

```sql
select public.backfill_posts_from_staging();
```

You get one jsonb value back. What each number must mean:

| key                            | expect                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| `inserted`                     | should equal **`bi_attributed_rows`** from pre-flight query 3        |
| `updated`                      | **0** on the first run (every row is new)                            |
| `skipped_unmatched`            | should equal the **sum** of the `posts` column in pre-flight query 4 |
| `skipped_no_id`                | usually **0**                                                        |
| `interactions_differs_from_bi` | ⚠️ **must be 0** — see below                                         |

**The arithmetic that must hold:**

```
inserted + updated + skipped_unmatched  =  staging_distinct_posts
```

If it does not, stop. Something is being dropped that nobody counted, which is
the exact failure mode this function was written to make impossible.

### ⚠️ `interactions_differs_from_bi` is the number that decides S2

Nobody has ever read `bi.linkedin_post_latest`'s definition of `interactions` —
the scrape does not carry the column, so the view derives it, and the expression
is not recorded anywhere in this repo. ArcBase now derives it as
**`likes + comments + reposts`**, which reconciles exactly against the scraper's
own `engagement_rate` on every sample row available.

- **`0`** — the definitions agree. History in `posts` is identical to what the
  reports show today, and S2 can proceed.
- **anything else** — the view counts something ArcBase does not (saves is the
  obvious candidate). **Do not start S2.** Report the number, and get the real
  definition with:

  ```sql
  select pg_get_viewdef('bi.linkedin_post_latest'::regclass, true);
  ```

**Re-running the backfill is safe.** It upserts on `linkedin_post_id`, so a
second run reports the same rows as `updated` instead of `inserted` and changes
no data. `uploaded_at` is deliberately not rewritten on update, so the record of
when a row first arrived survives a re-run.

---

## 3. Verify — ⚠️ run these ONE AT A TIME

The Supabase SQL editor shows **only the last statement's result**. Paste these
together and every result but the final one is silently discarded, which looks
exactly like a check you ran and passed.

### 1. ⚠️ THE ONE THAT MATTERS — `posts` and `bi.*` hold the same rows

```sql
select (select count(*) from public.posts)                  as posts_rows,
       (select count(*) from bi.linkedin_post_latest)       as bi_rows,
       (select count(*) from public.posts)
         - (select count(*) from bi.linkedin_post_latest)   as difference;
```

**Expect `difference = 0`.** This is "how you tell it worked", and it is a
number rather than a page load on purpose.

### 2. Attribution is a foreign key, and it does not set null

```sql
select conname, confrelid::regclass as references, confdeltype
  from pg_constraint
 where conrelid = 'public.posts'::regclass and contype = 'f';
```

**Expect two rows** — one onto `public.clients` and one onto `auth.users`, both
with `confdeltype = 'a'` (NO ACTION).

⚠️ **If the clients constraint shows `confdeltype = 'n'` (SET NULL), stop.**
Deleting one Client row would then silently unassign that Client's entire post
history — data loss wearing a default. This is the same defect the writers
registry had to correct.

### 3. ⚠️ NULL survived — no metric column was defaulted to 0

```sql
select column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'posts'
   and column_name in ('impressions','likes','comments','reposts','saves',
                       'interactions','provided_engagement_rate',
                       'calculated_engagement_rate','estimated_post_date')
 order by column_name;
```

**Expect every row `is_nullable = YES` and `column_default = NULL`.** A
`not null` or a `default 0` here is the single defect this whole ADR exists to
prevent, and it would be unrecoverable once data landed on it.

### 4. The four states are actually present in the data

```sql
select count(*)                                             as rows,
       count(*) filter (where saves is null)                as saves_unreadable,
       count(*) filter (where saves = 0)                    as saves_measured_zero,
       count(*) filter (where estimated_post_date is null)  as undated,
       count(*) filter (where interactions is null)         as interactions_unreadable
  from public.posts;
```

`saves_unreadable` and `saves_measured_zero` being **different numbers** is the
proof that NULL and 0 did not collapse. `undated` should be roughly the count of
hour-aged posts — those are excluded from dated charts on purpose and disclosed
as excluded.

### 5. The registry is read-only to everyone except the functions

```sql
select polname, polcmd from pg_policy where polrelid = 'public.posts'::regclass;
```

**Expect exactly one row**, `polcmd = 'r'` (SELECT).

```sql
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'posts' and grantee = 'anon';
```

**Expect zero rows.**

### 6. ⚠️ Staging is untouched

```sql
select count(*) as staging_rows_now from public.linkedin_posts_staging;
```

**Expect exactly the pre-flight number.** This script writes nothing to staging;
any change means it did something it was not supposed to.

---

## 4. ⚠️ After applying: reload PostgREST, then upload once

The script ends with `notify pgrst, 'reload schema';`, which is normally enough.
**Confirm by doing one real upload of a small file.**

Expect: the result summary reads the same as it always has (`N new, M updated`),
because the tally is still computed from staging and deliberately did not change.
Then check the row landed in both places:

```sql
select p.linkedin_post_id, p.client_id, p.interactions, p.estimated_post_date
  from public.posts p
 order by p.uploaded_at desc
 limit 5;
```

⚠️ **`client_id` must be the Client you picked on the form**, even if the scraped
author label disagrees with that Client's name. That is the entire point of the
slice, and it is the one behaviour no test in this repo can verify.

---

## ⚠️ FLAGS — confirm these live, and report anything that does not match

1. **`interactions_differs_from_bi` is unverified until you run it.** ArcBase's
   definition (`likes + comments + reposts`) is inferred from reconciling the
   scraper's own `engagement_rate` across five sample rows, not read from the
   view. Five rows is evidence, not proof.
2. **No absolute-date branch exists in the resolver.** Every `post_date` sample
   in this repo is relative (`23h`, `4d`, `5d`, `1w`). If the scraper ever emits
   an absolute date, those posts resolve to NULL and appear in the `undated`
   count rather than being silently mis-dated. If query 4 shows an `undated`
   count far above the number of hour-aged posts, that is the signal.
3. **A bare `"2m"` is read as 2 MINUTES, not 2 months**, and therefore resolves
   to NULL. LinkedIn has used `m` for both and no sample here contains it. If
   `undated` is unexpectedly high, check for `m`-suffixed ages in staging:
   `select post_date, count(*) from public.linkedin_posts_staging group by 1 order by 2 desc;`
4. **`urn` is not carried into `public.posts`.** The spec's table sketch does not
   include it. It still exists in staging, so nothing is lost yet — but it would
   be lost when staging is dropped in S3. Decide before then.
5. **The backfill reads `bi.linkedin_post_latest` for `estimated_post_date`.**
   This is deliberate: ArcBase's resolver lives in TypeScript so it can be
   unit-tested, and writing a second copy in plpgsql purely for the backfill
   would create two resolvers that must agree forever. Copying makes history
   identical to what the reports show today by construction. **New uploads use
   the TypeScript resolver; only history is copied, and only once.** It does mean
   the backfill must be run BEFORE `bi.*` is retired in S3.
6. **`skipped_unmatched` rows are not lost, they are unattributed.** They remain
   in staging exactly as they are. Once someone decides which Client each belongs
   to, they can be attributed directly in `posts` — which was impossible before,
   because there was no column to put the answer in.
