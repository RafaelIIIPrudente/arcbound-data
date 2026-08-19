# Applying the ArcBase posts read view (ADR 0010, slice S2)

This is the **cutover**. It adds `public.client_posts`, a read-only projection of
the app-owned `public.posts`, and the application shipped with it stops reading
`bi.linkedin_post_latest` entirely.

Applying it needs **your** Supabase auth, so you run it — the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`).

---

## ⚠️ Read this before you run anything

**This is the slice where reports change what they read.** S1 was safe to sit in
indefinitely because nothing queried `public.posts`. From here, every KPI, chart,
posts table, printed report and client-facing report link is served from it.

⚠️ **THE GATE IS A ROW COUNT, NOT A GREEN TEST SUITE.** `public.posts` is only as
populated as the S1 backfill made it. If that backfill has not run, the view is
empty — and an empty view does not raise an error, it renders as "No posts in
this period". **Blank reports, no alert, nothing in the logs.** Step 1 exists to
stop that, and it is not optional.

⚠️ **Nothing in this script has ever run.** No Postgres runs in ArcBase's test
suite — `supabase/sql-sync.test.ts` compares characters in two files and nothing
more. The view's column types, PostgREST's serialisation of them, and the
equivalence with `bi.*` are unverified until you run the checks below.

**Nothing is dropped.** `bi.linkedin_post_latest`, `public.linkedin_posts_staging`
and the staging write all continue untouched. Retiring them is S3.

---

## 0. Deploy order, and the one-line rollback

**SQL FIRST, THEN THE APPLICATION.** The code reads `public.client_posts` and
nothing else; deploying it before the view exists makes every read 404 and every
screen show its unavailable banner.

⚠️ **The rollback is four lines of code, not a database change.** Reverting the
commit puts all four read sites back on `bi.*`, which is still there, still
written to, and still correct. You are never more than one revert from the old
behaviour — so if the numbers below look wrong, revert the deploy and take your
time. Do not try to fix it forward under pressure.

---

## 1. ⚠️ THE GATE — has the S1 backfill actually run?

```sql
select count(*) as posts_rows from public.posts;
```

**If this is 0, STOP.** Go back to `supabase/POSTS-OWNERSHIP-APPLY.md` and run
`select public.backfill_posts_from_staging();`, reading its five counts. Deploying
the application against an empty `posts` blanks every report in the product.

Then, before applying anything:

```sql
select count(*) as bi_rows from bi.linkedin_post_latest;
```

Write both numbers down.

---

## Apply

**Option A — SQL editor (the working path).** Dashboard → **SQL Editor** → **New
query** → paste all of **`supabase/posts-read-view.sql`** → **Run**.

The last statement is a `select`, so you should see **one row**:

| column                   | expect                                                |
| ------------------------ | ----------------------------------------------------- |
| `posts_rows`             | the number from step 1                                |
| `app_view_rows`          | **the same as `posts_rows`** — the join drops nothing |
| `bi_view_rows`           | the number from step 1                                |
| `extra_rows_now_visible` | ⚠️ **positive or zero — NEVER negative**              |

### ⚠️ Why MORE rows is the correct answer

`bi.linkedin_post_latest` INNER JOINs on an exact author-name match, so it has
always **excluded** posts whose scraped author did not equal a client's name.
`public.posts` attributes by the `client_id` the operator selected, so those posts
are now included. **A positive `extra_rows_now_visible` is the fix working** —
Eitan Hoenig's fourteen posts are the population it is counting.

⚠️ **A NEGATIVE number means rows are missing** — the backfill did not finish, or
it skipped rows it should not have. That is a STOP. Do not deploy.

⚠️ **`app_view_rows` differing from `posts_rows` is also a STOP.** The join is on
a NOT NULL foreign key and cannot drop a row; if it does, `public.clients` has
lost a row that `public.posts` still references.

**Option B — CLI.** ⚠️ **Not recommended.** `supabase db push` would apply
`migrations/20260820120000_posts_read_view.sql`, which contains identical SQL, but
`public.clients` was created outside this repo's migrations so the CLI's picture
of the schema is not the live one. Use Option A.

Safe to re-run: `create or replace view` with an unchanged column list is a no-op.

---

## 2. ⚠️ The field-by-field diff — do the two sources AGREE on the overlap?

Row counts only prove nothing was lost. This proves the numbers match. Run it as
its own query.

```sql
select
  count(*)                                                                as compared,
  count(*) filter (where a.client_name        is distinct from b.client_name)        as client_name_differs,
  count(*) filter (where a.post_url           is distinct from b.post_url)           as post_url_differs,
  count(*) filter (where a.post_content       is distinct from b.post_content)       as post_content_differs,
  count(*) filter (where a.post_age           is distinct from b.post_age)           as post_age_differs,
  count(*) filter (where a.estimated_post_date is distinct from b.estimated_post_date) as est_date_differs,
  count(*) filter (where a.impressions        is distinct from b.impressions)        as impressions_differs,
  count(*) filter (where a.likes              is distinct from b.likes)              as likes_differs,
  count(*) filter (where a.comments           is distinct from b.comments)           as comments_differs,
  count(*) filter (where a.reposts            is distinct from b.reposts)            as reposts_differs,
  count(*) filter (where a.saves              is distinct from b.saves)              as saves_differs,
  count(*) filter (where a.interactions       is distinct from b.interactions)       as interactions_differs,
  count(*) filter (where a.provided_engagement_rate   is distinct from b.provided_engagement_rate)   as provided_rate_differs,
  count(*) filter (where round(a.calculated_engagement_rate::numeric, 4)
                        is distinct from round(b.calculated_engagement_rate::numeric, 4)) as calculated_rate_differs,
  count(*) filter (where a.scraped_at         is distinct from b.scraped_at)         as scraped_at_differs
from public.client_posts a
join bi.linkedin_post_latest b using (linkedin_post_id);
```

**Expect every `*_differs` column to be 0.** `compared` should equal `bi_rows`.

Notes on the ones most likely to be non-zero, and what each means:

- **`interactions_differs`** — this is the same measurement the S1 backfill
  returned as `interactions_differs_from_bi`. Non-zero means `bi.*` counts
  something ArcBase does not (saves is the likely candidate). ⚠️ **STOP and get
  the definition:** `select pg_get_viewdef('bi.linkedin_post_latest'::regclass, true);`
- **`calculated_rate_differs`** — compared at 4 decimal places on purpose;
  floating-point noise at the 15th place is not a disagreement. A real difference
  here follows from `interactions_differs`.
- **`est_date_differs`** — should be 0, because the S1 backfill COPIED
  `estimated_post_date` from this same view rather than recomputing it. A non-zero
  count means rows have been re-ingested since the backfill and ArcBase's
  TypeScript resolver disagrees with Shay's. Worth knowing either way.
- **`post_age_differs` / `scraped_at_differs`** — these are raw passthrough. A
  difference means the two are not looking at the same scrape.

---

## 3. ⚠️ The type check — what does PostgREST ACTUALLY send?

**This is the check no test can stand in for, and the failure it catches is
silent.** The seams declare every metric `number | null` and assert the row type
rather than validating it. If a rate arrives as the JSON **string** `"4.2"` it
flows straight through `num()` and `finite()` — both of which test
`typeof v === "number"` — and lands as NULL or a wrong figure on a PDF a client
downloads. Nothing logs an error.

In the SQL editor:

```sql
select row_to_json(t) from public.client_posts t limit 1;
```

Read the raw JSON and check with your eyes:

| field                                                                  | must look like               | NOT      |
| ---------------------------------------------------------------------- | ---------------------------- | -------- |
| `impressions`, `likes`, `comments`, `reposts`, `saves`, `interactions` | `1959`                       | `"1959"` |
| `provided_engagement_rate`, `calculated_engagement_rate`               | `2.14`                       | `"2.14"` |
| `estimated_post_date`, `scraped_at`, `uploaded_at`                     | `"2026-07-11T15:25:39.889Z"` | a number |

⚠️ **Quotes around a number are the failure.** If you see them, do not deploy —
report it, and the view's casts need revisiting.

⚠️ `row_to_json` is a close proxy for PostgREST's encoder but not identical. The
authoritative check is the app itself: after deploying, open a Client's report and
confirm the engagement-rate figures are non-blank and match what the same report
showed the day before.

---

## 4. Verify the view's shape — ⚠️ run these ONE AT A TIME

The SQL editor shows **only the last statement's result**. Paste these together
and every result but the final one is silently discarded.

### 1. It runs as the CALLER, not as its owner

```sql
select c.relname, c.reloptions
  from pg_class c
 where c.oid = 'public.client_posts'::regclass;
```

**Expect `reloptions` to contain `security_invoker=true`.**

⚠️ **If it is NULL or missing that option, the view bypasses the RLS policy on
`public.posts` and runs with the owner's rights.** Single-tenant makes the outcome
identical today, which is exactly why it would never be noticed — and exactly why
it must be set.

### 2. `anon` cannot read it

```sql
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'client_posts';
```

**Expect `authenticated` with `SELECT`, and NO row for `anon`.**

### 3. It projects exactly the 17 fields the app expects

```sql
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'client_posts'
 order by ordinal_position;
```

**Expect 17 rows**, `bigint` for the six counts, `double precision` for the two
rates, `timestamp with time zone` for the three timestamps.

### 4. ⚠️ `bi.*` and staging are untouched

```sql
select (select count(*) from bi.linkedin_post_latest)      as bi_rows,
       (select count(*) from public.linkedin_posts_staging) as staging_rows;
```

**Expect both unchanged from step 1.** This script writes nothing and drops
nothing; any change means it did something it was not supposed to.

---

## 5. After deploying the application

1. **Open `/clients`.** Post counts must be present, not em dashes.
2. **Open one Client's report.** Compare the KPI figures against the same report
   from before the cutover. ⚠️ Impressions and interactions should match; the
   POST COUNT may be HIGHER for any client whose scrape had a mangled author.
3. **Do one upload.** The result summary should read as it always has. The
   name-mismatch confirmation screen now says the posts will be _filed under the
   selected client anyway_ — that copy shipped in this same commit because it
   became false the moment the reads moved.

⚠️ **If reports are blank, the backfill is the cause, not the view.** Revert the
deploy (four lines), run the backfill, re-verify step 1, and redeploy.

---

## ⚠️ FLAGS — confirm these live, and report anything that does not match

1. **`interactions_differs_from_bi` may never have been read.** It is returned by
   the S1 backfill and re-checkable in step 2 here. Until someone reads it, the
   claim that ArcBase's `interactions` matches the view's is inferred from five
   sample rows, not measured.
2. **`estimated_post_date` for HISTORY came from `bi.*`, for NEW uploads it comes
   from ArcBase's TypeScript resolver.** Step 2's `est_date_differs` is the first
   comparison of the two. They should agree; if they do not, the resolver's
   hour-age or month handling differs from Shay's and the report's weekday chart
   will shift.
3. **Nothing measures the view's PERFORMANCE.** `bi.linkedin_post_latest` joined
   two tables over an unindexed text column; `client_posts` joins on a primary
   key, so it should be faster. "Should be" is not "is" — if a report feels slow
   after the cutover, say so.
4. **S3 has not happened.** The staging write, `public.post_attributes` and every
   `bi.*` object are still live and still costing a write per upload. That is
   deliberate — it is what keeps the rollback one revert deep.
