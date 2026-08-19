# Applying ArcBase posts-as-sole-source (ADR 0010, slice S3)

This makes `public.posts` the only store an upload writes and the only source any
read uses — **including the report your Clients download**, which slice S2 missed.

Applying it needs **your** Supabase auth, so you run it — the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`).

---

## ⚠️ THIS IS THE POINT OF NO RETURN. READ THIS PARAGRAPH TWICE.

Every earlier slice was **one revert deep**. `bi.*` was still being fed by every
upload, so reverting the application put it back on a source that was still
correct.

**That stops here.** The moment this pair applies, `public.linkedin_posts_staging`
is no longer written — so `bi.linkedin_post_latest` begins going stale
immediately. After the next upload, reverting the application no longer gives you
the old system: it gives you a report that is **silently missing every post
uploaded since**. No error, no banner, just a smaller number on a document.

If you are not ready to stay on `public.posts`, stop now. Nothing is lost by
waiting; the dual-write costs one extra write per row and nothing else.

---

## ⚠️ Why this slice exists: a grep that was true and incomplete

S2's acceptance criterion was `grep '.schema("bi")' src/` returning nothing. It
returned nothing, and it was true, and it **missed an entire client-facing
surface**.

`report_link_read` — the `SECURITY DEFINER` function behind `/r/[token]` — reads
`bi.linkedin_post_latest` **in plpgsql**. A grep over TypeScript cannot see a read
written in SQL. So if S2 deploys alone, **staff read FK-attributed data while
Clients read name-matched data**, and the two documents for the same Client can
disagree — with the wrong one in the Client's hands.

⚠️ **Part A of this pair is therefore a prerequisite for S2's deployment, not a
follow-up.** Ship them together, or knowingly accept a divergent Client report in
between.

---

## 0. Prerequisites

Both earlier pairs applied, and the backfill **run**:

```sql
select (select count(*) from public.posts)        as posts_rows,
       to_regclass('public.client_posts')         as view_exists;
```

**`posts_rows` must be > 0 and `view_exists` must be `client_posts`.** If
`posts_rows` is 0 the backfill has not run — go back to
`supabase/POSTS-OWNERSHIP-APPLY.md` and run it. Applying this pair with an empty
`posts` and then deploying blanks every report **and** stops the staging write
that would have let you recover.

---

## 1. ⚠️ Pre-flight — the two numbers that must never move again

```sql
select (select count(*) from public.linkedin_posts_staging) as staging_rows,
       (select count(*) from public.post_attributes)        as attribute_rows;
```

**Write both down.** From the moment this applies, neither may ever grow again.
Checking them after the next upload is how you prove the dual-write really
stopped — see step 5.

---

## Apply

**Option A — SQL editor (the working path).** Dashboard → **SQL Editor** → **New
query** → paste all of **`supabase/posts-sole-source.sql`** → **Run**.

The last statement is a `select`, so you should see **one row**:

| column                      | expect                                              |
| --------------------------- | --------------------------------------------------- |
| `posts_rows`                | the number from step 0                              |
| `client_posts_rows`         | **the same** — the join drops nothing               |
| `rows_with_format`          | most of them; 0 would mean no format was backfilled |
| `staging_rows_frozen_at`    | the number from step 1 — **write it down**          |
| `post_attributes_frozen_at` | the number from step 1 — **write it down**          |

**Option B — CLI.** ⚠️ **Not recommended.** `supabase db push` would apply
`migrations/20260821120000_posts_sole_source.sql`, which contains identical SQL,
but `public.clients`, `public.linkedin_posts_staging` and the `bi` schema were all
created outside this repo's migrations. Use Option A.

Safe to re-run: one `create or replace view` and two `create or replace function`.

### ⚠️ If you already hit `ERROR: 42P16` — that was a real bug, now fixed

An earlier version of this script placed `post_format_type` in the middle of the
view's column list and failed with:

```
ERROR: 42P16: cannot change name of view column "scraped_at" to "post_format_type"
HINT:  Use ALTER VIEW ... RENAME COLUMN ... to change name of view column instead.
```

`create or replace view` can only **append** columns — every existing one must
keep its name, type **and position**. The column is now last, which is a pure
append and is permitted. **Re-paste the current script; nothing needs undoing.**

The SQL editor runs the script in a transaction, so that failure rolled the whole
thing back. Confirm before re-running, if you want certainty:

```sql
select count(*) as columns_now,
       bool_or(column_name = 'post_format_type') as already_added
  from information_schema.columns
 where table_schema = 'public' and table_name = 'client_posts';
```

**Expect `columns_now = 17` and `already_added = false`** — the state S2 left. If
it already says 18/true, the script applied and you are simply re-running it.

---

## 2. ⚠️ Deploy order — BOTH ORDERS ARE SAFE, DELIBERATELY

This is the one slice where the SQL and the application were designed so that
either can go first. You should still prefer **SQL first**, but you are not racing
a stopwatch.

The hazard that was designed away: `report_link_read` returns a jsonb bundle whose
`attributes[]` array carries each post's format. If the new function had simply
stopped emitting that key, then between applying the SQL and deploying the app,
**every post on every Client's report would have rendered as UNKNOWN format** — a
visibly wrong document, client-facing, raising nothing.

So:

| Order                    | What happens                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **SQL first, app after** | The new function still emits `attributes[]` (projected from the row). The OLD app reads it exactly as before. ✅ |
| **App first, SQL after** | The new app finds no `post_format_type` on the row and falls back to `attributes[]` from the OLD function. ✅    |

Both paths are unit-tested in `src/services/report-links.test.ts`
(`withFormatFallback — both deploy orders render correct formats`).

⚠️ **The `attributes[]` key retires with `public.post_attributes` itself**, in the
drop step, once no deployed app reads it. Do not remove it early.

---

## 3. Verify the client-facing read — ⚠️ ONE AT A TIME

The SQL editor shows only the last statement's result.

### 1. `report_link_read` no longer reads `bi.*`

```sql
select pg_get_functiondef('public.report_link_read(text, text)'::regprocedure)
       ~ 'bi\.linkedin_post_latest' as still_reads_bi;
```

**Expect `false`.** ⚠️ If this is `true` the function did not replace — check for
an overload with a different signature and report it rather than dropping
anything.

### 2. Its guards are intact

```sql
select prosecdef, proacl::text
  from pg_proc
 where oid = 'public.report_link_read(text, text)'::regprocedure;
```

**Expect `prosecdef = true`** and the ACL to grant EXECUTE to `anon` and
`authenticated` — this function is the only path `anon` has to any data, so
`prosecdef = false` would break the report entirely and a missing `anon` grant
would too.

### 3. A real token still resolves

Open a live `/r/<token>` URL and enter its Access Code. **Expect the report to
render with correct asset types** (Document / Video / Image, never all Unknown).
⚠️ All-Unknown means the format is reaching neither the row nor `attributes[]` —
stop and report it; that is the exact failure this slice designed around.

### 4. `ingest_metrics` writes only `posts`

```sql
select pg_get_functiondef('public.ingest_metrics(uuid, text, jsonb, int, int)'::regprocedure)
       ~ 'linkedin_posts_staging' as still_writes_staging;
```

**Expect `false`.**

### 5. The view gained its column, at the END

```sql
select ordinal_position, column_name
  from information_schema.columns
 where table_schema = 'public' and table_name = 'client_posts'
 order by ordinal_position;
```

**Expect 18 rows**, with `post_format_type` at position **18**. Positions 1–17
must be unchanged from before. ⚠️ Column ORDER is not part of any contract here —
every consumer addresses columns by name — but the append is what makes
`create or replace view` legal at all.

### 6. Nothing was dropped

```sql
select to_regclass('bi.linkedin_post_latest')            as bi_view,
       to_regclass('public.linkedin_posts_staging')      as staging,
       to_regclass('public.post_attributes')             as attributes,
       to_regproc('public.backfill_posts_from_staging')  as backfill;
```

**Expect all four non-NULL.** They stay, unwritten and unread, until a separate
confirmed drop step.

---

## 4. After deploying: do one upload and read the tally

⚠️ **THE UPLOAD SUMMARY'S NUMBERS NOW MEAN SOMETHING SLIGHTLY DIFFERENT**, and it
is a number staff read every week, so expect the difference rather than being
surprised by it:

- `inserted` — the row did not exist in `public.posts`.
- `unchanged` — it existed and **every value being written is identical** to what
  is stored.
- `updated` — it existed and at least one value differs.

**The same file can tally differently than it used to**, in four ways, none of
them a bug:

1. **Typed, not textual.** `"1,959"` and `"1959"` were two different strings and
   are one `bigint`. A re-upload that only reformatted a number now reads
   UNCHANGED where it read UPDATED.
2. **Wider.** The old comparison looked at six metric strings. The new one looks
   at every column written, so a file where only `post_content` changed now reads
   UPDATED where it read UNCHANGED.
3. **Attribution counts.** Re-uploading a post under a different Client changes
   `client_id`, which is a real change and reads UPDATED.
4. **Posts that were never in staging** — the ones the name match dropped — are
   in `public.posts` now, so their first re-upload reads UNCHANGED rather than
   INSERTED.

---

## 5. ⚠️ THE PROOF THAT THE DUAL-WRITE STOPPED

After that upload, re-run step 1:

```sql
select (select count(*) from public.linkedin_posts_staging) as staging_rows,
       (select count(*) from public.post_attributes)        as attribute_rows;
```

**Both numbers must be EXACTLY what you wrote down.** If either grew, something is
still dual-writing — an old `ingest_metrics` overload is the likeliest cause.
Report it; do not drop anything.

And confirm the new row landed where it should:

```sql
select linkedin_post_id, client_id, post_format_type, uploaded_at
  from public.posts order by uploaded_at desc limit 5;
```

---

## ⚠️ FLAGS

1. **`bi.linkedin_post_latest` is now STALE and still exists.** Anyone reading it
   — a saved query, a spreadsheet, Shay — sees a snapshot frozen at this moment.
   It is not wrong-looking; it is just old. Tell whoever might read it.
2. **Rollback is no longer a code revert.** After the first upload, restoring the
   old behaviour means re-running `backfill_posts_from_staging()` in reverse,
   which does not exist. Treat the deploy as one-way.
3. **Nothing here has been executed.** No Postgres runs in ArcBase's test suite;
   `sql-sync.test.ts` compares characters in two files. The function bodies, the
   tally arithmetic, and the client-facing bundle shape are unverified until you
   run the checks above.
4. **The drops are still outstanding**, deliberately. `bi.*`,
   `linkedin_posts_staging`, `post_attributes` and
   `backfill_posts_from_staging()` should not be dropped until ArcBase has run on
   `public.posts` for about a week.
