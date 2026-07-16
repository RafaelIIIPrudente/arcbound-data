# Supabase (SSR auth · RLS · CLI) — docs digest

**Pinned to:** `@supabase/ssr ^0.6.1`, `@supabase/supabase-js ^2.49.4`, Supabase CLI `^2.109.1` (see the
repo `package.json`). Next.js 15 App Router, single-tenant, RLS as the authorization boundary. Refresh
if any bumps a major/minor that changes the idioms below.

**Researched on:** 2026-07-16. A distillation of the CURRENT Supabase model, pinned to the versions
above — a summary with citations, not a copy of the docs.

> **Pinning caveat:** the live docs have moved to a newer `@supabase/ssr`/`supabase-js` generation.
> Three idioms are flagged **do not adopt on this pin**: `auth.getClaims()` (needs supabase-js ≥2.50),
> the two-arg `setAll(cookiesToSet, cacheHeaders)` (0.7.0+), and the "Proxy" middleware rename (same
> concept as the pinned `updateSession` pattern). Use `getUser()`, single-arg `setAll`/the repo's
> cookie methods, and `middleware.ts`.

**Official sources:**

- <https://supabase.com/docs/guides/auth/server-side/nextjs>
- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/api/api-keys>
- <https://supabase.com/docs/guides/local-development>
- <https://supabase.com/docs/reference/cli/introduction>
- <https://supabase.com/docs/reference/cli/supabase-gen-types>
- <https://supabase.com/docs/guides/deployment/database-migrations>

---

## SSR clients (server / browser / middleware)

- **Browser client** (Client Components): `createBrowserClient(url, anonKey)` — singleton internally,
  safe to call freely; env vars are `NEXT_PUBLIC_`-prefixed
  (<https://supabase.com/docs/guides/auth/server-side/creating-a-client>).
- **Server client** (Server Components / Route Handlers / Server Actions): `createServerClient(url,
key, { cookies: { … } })`. The docs' current cookie interface is the **`getAll`/`setAll`** pair;
  the older **`get`/`set`/`remove`** four-method shape still works on `@supabase/ssr ^0.6.1`
  (<https://supabase.com/docs/guides/auth/server-side/creating-a-client>).
  - **Do not adopt on this pin:** the two-arg `setAll(cookiesToSet, cacheHeaders)` — the `cacheHeaders`
    param is a 0.7.0+ feature. Server Components can't write cookies, so wrap the setter in a
    `try/catch` no-op and rely on middleware to refresh.
- **Middleware (session refresh):** create a server client bound to the request/response cookies and
  do the auth check to refresh the token, **returning the mutated response** so refreshed cookies
  propagate (skipping this causes random logouts). Do the auth check immediately after creating the
  client (<https://supabase.com/docs/guides/auth/server-side/nextjs>).

## getUser vs getSession — the security boundary (CRITICAL)

- **Protect pages/data with `supabase.auth.getUser()`, never `getSession()`.** `getUser()` sends a
  request to the Auth server to **revalidate the token every time**; `getSession()` reads from
  cookies/storage and is **not** re-validated, so its embedded user "shouldn't be trusted on its own
  when storage is shared with the client"
  (<https://supabase.com/docs/guides/auth/server-side/creating-a-client>).
- **Do not adopt on this pin:** `auth.getClaims()` — the current docs lead with it (local JWKS
  verification), but it's tied to the signing-keys feature and **supabase-js ≥ 2.50**; the `^2.49.4`
  floor predates it. `getUser()` gives the same "revalidate against the Auth server" guarantee
  (<https://supabase.com/docs/guides/auth/server-side/nextjs>).

## RLS policies

- **Enable per table on exposed schemas:** `alter table "t" enable row level security;` — RLS **must**
  be on for any table in an exposed schema (default `public`) or it is **publicly readable** through
  the API via the anon key (<https://supabase.com/docs/guides/database/postgres/row-level-security>).
- **Clause per operation:** `SELECT` → `using`; `INSERT` → `with check`; `UPDATE` → **both** `using`
  and `with check` (and needs a `SELECT` policy too); `DELETE` → `using`
  (<https://supabase.com/docs/guides/database/postgres/row-level-security>).
- **Best practices:** wrap functions in a subselect — `(select auth.uid())` — so Postgres caches the
  value per statement (docs cite 94–99% speedups); always add a **`to authenticated`/`to anon`** role
  clause. Use `auth.uid()` for the current user and `auth.jwt()` for claims (use `raw_app_meta_data`
  for authz, never the user-writable `raw_user_meta_data`)
  (<https://supabase.com/docs/guides/database/postgres/row-level-security>).

## API keys — the server-only secret

- **anon / publishable key = client-safe** — guarded by Postgres via the `anon`/`authenticated`
  roles, so it's only as safe as your RLS. Here it's `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (<https://supabase.com/docs/guides/api/api-keys>).
- **service_role / secret key = server-only, bypasses RLS** (`BYPASSRLS`, "full access… bypassing Row
  Level Security"). Docs: **"Never expose your secret keys publicly."** Keep it in server-only env
  (`SUPABASE_SERVICE_ROLE_KEY`), **never `NEXT_PUBLIC_*`**, never in a Client Component
  (<https://supabase.com/docs/guides/api/api-keys>).
- The new `sb_publishable_…`/`sb_secret_…` key names are optional; the legacy `anon`/`service_role`
  model still works and is canonical for this pin — treat the new format as a later migration
  (<https://supabase.com/docs/guides/api/api-keys>).

## CLI — local dev, migrations, gen types

- Install as a dev dep and run via the package manager (`npx supabase …`), not a global install
  (<https://supabase.com/docs/guides/local-development>).
- **Local stack (Docker):** `supabase start` (Studio on `:54323`); `supabase stop` to tear down
  (<https://supabase.com/docs/guides/local-development>).
- **Migrations:** `supabase migration new <name>`, `supabase migration up` (apply locally),
  `supabase db diff -f <name>` (capture schema changes), `supabase db push` (apply to the linked
  remote), `supabase migration list` (local vs remote)
  (<https://supabase.com/docs/guides/deployment/database-migrations>).
- **`supabase db reset`** drops/recreates the **local** DB, re-runs all migrations, then applies
  `supabase/seed.sql` — the primary local reset loop
  (<https://supabase.com/docs/guides/deployment/database-migrations>).
- **Generate DB types:** `supabase gen types typescript --local > database.types.ts`; flags `--local`,
  `--linked`, `--project-id`, `--schema`. Regenerate after every migration
  (<https://supabase.com/docs/reference/cli/supabase-gen-types>).

## Do-not-adopt-on-pin summary

1. `getClaims()` → use **`getUser()`** (supabase-js ≥2.50 is newer than `^2.49.4`).
2. `setAll(cookiesToSet, cacheHeaders)` two-arg → single-arg / the repo's cookie methods (`cacheHeaders`
   is `@supabase/ssr` 0.7.0+).
3. "Proxy" middleware naming → keep the `middleware.ts` / `updateSession` pattern.
4. `sb_publishable_`/`sb_secret_` keys → legacy `anon`/`service_role` remain canonical.
