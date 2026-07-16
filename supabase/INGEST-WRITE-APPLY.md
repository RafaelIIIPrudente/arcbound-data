# Applying the ArcBase ingest-write schema

This SQL is **ADDITIVE and safe** — it creates only `public.uploads` and
`public.ingest_metrics`, and **drops/alters nothing** the analytics engineer owns
(`linkedin_posts_staging`, the `clients` shape, the `bi.*` views). It adds no
unique constraint, `client_id`, or column to staging. Applying it needs **your**
Supabase auth, so you run it — the agent does not.

**Project ref:** `jozdugwmmyxacmksqjdl` (subdomain of `NEXT_PUBLIC_SUPABASE_URL`).

## Apply

**Option A — SQL editor (simplest):** Dashboard → **SQL Editor** → **New query** →
paste all of **`supabase/ingest-write.sql`** → **Run**.

**Option B — CLI (if linked):**

```bash
supabase login                                      # once
supabase link --project-ref jozdugwmmyxacmksqjdl    # once; DB password when prompted
supabase db push                                    # applies 20260716120000_arcbase_ingest_write.sql
```

If `supabase db push` complains about the un-tracked out-of-band tables, use
Option A (SQL editor) — the DDL is identical and additive.

## ⚠️ One possible change to a SHARED table (`public.clients`)

The app reads and inserts `public.clients` directly (the Add-Client flow + the
Clients list). If `clients` has **RLS enabled but no policies for `authenticated`**,
the app can't read or insert clients. If so — and ONLY if needed — add the two
minimal policies (this is the single change that touches a shared table; confirm
with Shay it's acceptable):

```sql
alter table public.clients enable row level security;  -- no-op if already enabled

drop policy if exists clients_select_authenticated on public.clients;
create policy clients_select_authenticated on public.clients
  for select to authenticated using (true);

drop policy if exists clients_insert_authenticated on public.clients;
create policy clients_insert_authenticated on public.clients
  for insert to authenticated with check (true);
```

## Reading the `bi` views from the app

The Clients list shows a per-client post count from `bi.linkedin_post_latest`. For
the app's Supabase client to read the `bi` schema, **`bi` must be in the API's
exposed schemas** (Dashboard → Project Settings → API → _Exposed schemas_ → add
`bi`). Until then the app falls back to a post count of `0` (it does not error).
The full analytics read side is the next pass.

## Verify (SQL editor)

```sql
-- app-owned objects exist
select to_regclass('public.uploads');                       -- not null
select proname, prosecdef from pg_proc where proname = 'ingest_metrics';  -- prosecdef = true

-- externally-owned objects are UNTOUCHED
select to_regclass('public.linkedin_posts_staging');        -- still present
select count(*) from information_schema.columns
where table_name = 'linkedin_posts_staging' and column_name = 'client_id';  -- expect 0

-- RLS on uploads
select relrowsecurity from pg_class where relname = 'uploads';   -- true
```

## After applying

- Optionally `pnpm db:types` (regenerates `src/lib/supabase/database.types.ts`
  from the live schema; the seams also work with the explicit interfaces already
  in code).
- The app's WRITE side (Add-Client, Upload) now hits the real DB. The analytics
  READ side is the next pass.
