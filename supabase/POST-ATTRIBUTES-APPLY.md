# Applying the ArcBase post-attributes schema

This SQL creates the app-owned `public.post_attributes` table and the one-time
`public.backfill_post_attributes()` repair — and it **replaces the live
`public.ingest_metrics` function**. Read the warning below before running it.

It **drops/alters nothing the analytics engineer owns**: no column, constraint,
or index is added to `public.linkedin_posts_staging`, the `public.clients` shape
is untouched, and the `bi.*` views are untouched (ADR 0009). The backfill only
`SELECT`s from staging. Applying it needs **your** Supabase auth, so you run it —
the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (subdomain of `NEXT_PUBLIC_SUPABASE_URL`).

## ⚠️ This REPLACES the live `ingest_metrics` function

`ingest_metrics` is the function every upload runs. This script issues a
`create or replace` on it, so applying the script swaps out the live function.
Do it **deliberately**, not incidentally.

The replacement is byte-identical to the shipped version in signature, validation,
tally logic, staging writes, the `public.uploads` audit row, the return shape, and
its all-or-nothing rollback. The **only** behavioural change is one added upsert
inside the row loop, which records each post's raw `post_format_type` into
`public.post_attributes` in the **same transaction** — so a format record can
never drift from its staging row, and a failed ingest rolls back both.

Why it exists at all: `bi.linkedin_post_latest` exposes seventeen columns and
`post_format_type` is **not** among them, and that view is out of scope to change.
ArcBase already resolves each post's format during upload review, so it records
the format itself and joins it back to the BI rows at read time.

## Apply

**Option A — SQL editor (the working path):** Dashboard → **SQL Editor** →
**New query** → paste all of **`supabase/post-attributes.sql`** → **Run**.

**Option B — CLI (if linked):**

```bash
supabase db push    # applies 20260722120000_post_attributes.sql
```

If `supabase db push` complains about the un-tracked out-of-band tables, use
Option A — the DDL is identical (a test asserts the two files stay in sync).

The script is **safe to re-run**: the table uses `create table if not exists`, the
policy is dropped and recreated, and both functions are `create or replace`.

## ⚠️ Then run the backfill — ONCE

```sql
select public.backfill_post_attributes();   -- → {"backfilled": <n>}
```

**This is required, not optional.** Only posts ingested _after_ the migration get
a format record from `ingest_metrics`. Without the backfill, both asset-type
panels on the Client LinkedIn Report show nearly every historical post as
**Unknown** — which looks like a product defect but is really just missing data.

It is idempotent: it copies the format already sitting in staging using
`on conflict do nothing`, so a second run reports `{"backfilled": 0}`, changes
nothing, and never clobbers a fresher record written by `ingest_metrics`.

## Verify (SQL editor)

```sql
-- app-owned objects exist
select to_regclass('public.post_attributes');                   -- not null
select proname, prosecdef from pg_proc
where proname in ('ingest_metrics', 'backfill_post_attributes'); -- prosecdef = true for both

-- RLS is on, and is SELECT-only for authenticated (writes go through the
-- SECURITY DEFINER functions, whose owner bypasses RLS)
select relrowsecurity from pg_class where relname = 'post_attributes';  -- true
select polname, polcmd from pg_policy
where polrelid = 'public.post_attributes'::regclass;            -- exactly one row, polcmd = 'r'

-- nothing is granted to anon
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'post_attributes' and grantee = 'anon';      -- expect 0 rows

-- externally-owned objects are UNTOUCHED
select to_regclass('public.linkedin_posts_staging');            -- still present
select count(*) from information_schema.columns
where table_name = 'linkedin_posts_staging'
  and column_name in ('client_id', 'post_format_type_canonical');  -- expect 0

-- the backfill actually landed
select count(*) from public.post_attributes;                    -- > 0 after the backfill
```

## After applying

- The Client LinkedIn Report's Content Mix section (`/clients/[id]/report`) starts
  showing real asset types instead of Unknown.
- `post_format_type` is stored **raw**, exactly as the Scrape sent it (ADR 0009),
  so mixed-case variants of one format are possible in this table. Anything that
  groups by asset type must canonicalise first — the app does this at read time
  via `toCanonicalFormat` in `src/lib/post-format.ts`. Never group on the raw
  string, or one format splits across several buckets.
- Optionally `pnpm db:types` to regenerate `src/lib/supabase/database.types.ts`.
