# Applying the ArcBase Report Links schema

This SQL is **ADDITIVE and safe** — it creates only `public.report_links`,
`public.report_link_grants`, and five `*_report_link*` SECURITY DEFINER functions,
and **drops/alters nothing** the analytics engineer owns (`linkedin_posts_staging`,
the `clients` shape, the `bi.*` views). Applying it needs **your** Supabase auth,
so you run it — the agent does not.

It is the data layer behind the client-facing **Report Link** (a Client viewing
their own live report at `/r/<token>`, gated by an out-of-band **Access Code**).
See [ADR 0011](../docs/adr/0011-client-report-links.md) and
[the spec](../docs/specs/2026-07-25-client-report-links.md).

**Project ref:** `jozdugwmmyxacmksqjdl` (subdomain of `NEXT_PUBLIC_SUPABASE_URL`).

> ⚠️ **RE-APPLY if you already ran an earlier version.** Slice **S5** added
> `report_link_grants` + `report_link_read` and made `resolve_report_link` also
> mint a read grant. The script is idempotent (`create table if not exists`,
> `create or replace function`), so just paste **`supabase/report-links.sql`**
> again — it upgrades in place without touching existing rows.

## Security posture (why this is safe to expose publicly)

- **The Access Code is never stored** — only its bcrypt hash (`crypt(code,
gen_salt('bf'))`), returned exactly ONCE at issue/rotate and unrecoverable after.
- **`anon` has NO direct read** on `report_links` or `report_link_grants` or
  `bi.*`. The anonymous public path can only **call two functions**:
  - `resolve_report_link(token, code)` — verifies the Access Code, does its own
    failed-attempt lockout (5 fails → 15 min), and **on success ONLY** mints a
    short-lived **read grant** (returned raw once, stored sha256-hashed, 2 h TTL).
    Returns `{status: ok|invalid|locked, client_id?, read_grant?}`. An unknown/
    revoked token and a wrong code both return `invalid` — no auth oracle.
  - `report_link_read(token, grant)` — returns that ONE client's report source
    (`bi.linkedin_post_latest` rows + `public.uploads` + `public.post_attributes`
    - client name) **only** for a valid token AND a matching, unexpired grant.
      Any failure returns `null` — never an error, never an oracle.
- **The two-factor reaches the DATA.** A URL/token holder WITHOUT a grant (or with
  an expired one) reads **nothing** — the grant is minted only by passing the
  Access Code. **No service-role key is used.**
- **Staff-only mutations.** `issue_report_link` / `rotate_report_link` /
  `revoke_report_link` are granted to `authenticated` only. Revoke also drops the
  link's live grants, so outstanding viewer sessions lose data access at once.

## ⚠️ One privilege to confirm — the definer owner must read `bi`

`report_link_read` reads `bi.linkedin_post_latest`. It runs as its **owner** (the
role that creates it — `postgres` when you paste in the SQL editor). That role
must have `usage` on schema `bi` and `select` on `bi.linkedin_post_latest` (and on
`public.uploads` / `public.post_attributes`, which it owns). On Supabase `postgres`
already has this; **confirm with the verify query below**. If the read comes back
empty for a client you KNOW has posts, grant it (ask Shay before touching `bi`):

```sql
grant usage  on schema bi to postgres;
grant select on bi.linkedin_post_latest to postgres;
```

## Apply

**Option A — SQL editor (simplest):** Dashboard → **SQL Editor** → **New query** →
paste all of **`supabase/report-links.sql`** → **Run**.

**Option B — CLI (if linked):**

```bash
supabase login                                      # once
supabase link --project-ref jozdugwmmyxacmksqjdl    # once; DB password when prompted
supabase db push                                    # applies 20260725120000_report_links.sql
```

If `supabase db push` complains about the un-tracked out-of-band tables, use
Option A (SQL editor) — the DDL is identical and additive.

## Verify (SQL editor)

```sql
-- app-owned objects exist and the functions are SECURITY DEFINER
select to_regclass('public.report_links'), to_regclass('public.report_link_grants');  -- both not null
select proname, prosecdef from pg_proc
  where proname in ('resolve_report_link','report_link_read','issue_report_link',
                    'rotate_report_link','revoke_report_link');              -- prosecdef = true

-- anon can EXECUTE resolve + read but NOTHING else; staff get the mutations
select has_function_privilege('anon', 'public.resolve_report_link(text,text)', 'execute'); -- true
select has_function_privilege('anon', 'public.report_link_read(text,text)', 'execute');    -- true
select has_function_privilege('anon', 'public.issue_report_link(uuid)', 'execute');        -- false

-- anon has no direct table read (RLS on, no anon policy) on either table
select relname, relrowsecurity from pg_class
  where relname in ('report_links','report_link_grants');                    -- rowsecurity = true

-- the definer owner CAN read bi (this is the privilege to confirm)
select has_table_privilege('postgres', 'bi.linkedin_post_latest', 'select'); -- true

-- externally-owned objects are UNTOUCHED
select to_regclass('public.linkedin_posts_staging');                         -- still present
```

## Smoke test (SQL editor — optional, uses a real client id)

```sql
-- issue → resolve OK (returns a read_grant) → read the bundle → wrong grant reads nothing
select public.issue_report_link('<a real clients.id>');   -- copy token + access_code
select public.resolve_report_link('<token>', '<access_code>');   -- {"status":"ok","client_id":...,"read_grant":"…"}
select public.report_link_read('<token>', '<read_grant>');       -- jsonb {client_id, client_name, posts:[…], uploads:[…], attributes:[…]}
select public.report_link_read('<token>', 'not-a-real-grant');   -- null  (no grant → no data, no oracle)
select public.report_link_read('<token>', null);                 -- null

-- revoke drops the link AND its live grants
select public.revoke_report_link('<a real clients.id>');
select public.report_link_read('<token>', '<read_grant>');       -- null  (link revoked)
```

## After applying

- The public route `/r/<token>` now renders **real data**: the gate mints a read
  grant on a correct Access Code, seals it into the signed cookie, and the view
  fetches the report source through `report_link_read`. Until applied, the route
  **fails closed** — every RPC error maps to `invalid`/`null`, so the gate denies
  and the view shows "not available" rather than crashing.
- The staff Create/Rotate/Revoke UI (slice **S2**) is a separate pass and is not
  required for the public read to work; issue/rotate/revoke via the smoke test
  above in the meantime.

```

```
