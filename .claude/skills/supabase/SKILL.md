---
name: supabase
description: Use when touching auth, data access, RLS, env, or migrations in this repo — enforces Supabase @supabase/ssr idioms (server/browser/middleware clients, verified getUser, RLS-as-boundary) and this repo's server-only-secret and single-tenant rails; keeps us aligned with current Supabase docs.
---

# Supabase (stack alignment)

Keep this repo's Supabase usage aligned with **`@supabase/ssr` server-side auth** and this repo's
security rails. The distilled, cited docs live in
[`references/supabase-docs.md`](references/supabase-docs.md); the wiring is in
[`src/lib/supabase/`](../../../src/lib/supabase), [`src/lib/auth/`](../../../src/lib/auth),
[`src/middleware.ts`](../../../src/middleware.ts), and [`supabase/config.toml`](../../../supabase/config.toml).
The decisions are [ADR 0002](../../../docs/adr/0002-supabase-only-auth.md) (Supabase-only auth),
[ADR 0006](../../../docs/adr/0006-app-owned-posts-table.md) (posts table), and
[ADR 0007](../../../docs/adr/0007-arcbase-single-tenant.md) (single-tenant).

## When to use

- Touching an auth path, a Supabase client, `src/middleware.ts`, or `getSession()`.
- Reading/writing app data through the Service Seam's Supabase-backed services (T2+).
- Adding env vars, an RLS policy, a migration, or regenerating DB types.
- **Any time a secret, a service-role key, or `getSession()` is in play — read the rails below first.**

## Pinned version

From `package.json`: `@supabase/ssr ^0.6.1`, `@supabase/supabase-js ^2.49.4`, CLI `supabase ^2.109.1`.
Scripts: `db:reset` (`supabase db reset`) and `db:types`
(`supabase gen types typescript --local > src/lib/supabase/database.types.ts`). **Aligned to these pins
— refresh if any bumps.** The live docs have moved ahead — do **not** adopt `getClaims()`, two-arg
`setAll`, or the "Proxy" middleware rename on this pin (see Refresh).

## Current idioms (@supabase/ssr 0.6)

Sourced + cited in [`references/supabase-docs.md`](references/supabase-docs.md):

- **Three clients:** `createBrowserClient` (Client Components), `createServerClient` (Server
  Components / Route Handlers / Server Actions, with a cookies adapter), and a **middleware** client
  that refreshes the session cookie and returns the mutated response.
- **`auth.getUser()` is the authorization boundary** — it revalidates the token with the Auth server.
  **Never trust `getSession()`** (cookie-read, not revalidated) or client metadata for authz.
- **RLS is the real boundary** — enable it on every exposed table; policies use `(select
auth.uid())` + a `to authenticated` role clause.
- **Key split:** the `anon` key is client-safe (`NEXT_PUBLIC_`); the `service_role`/secret key is
  **server-only**, bypasses RLS, and must never reach the browser.
- **CLI for schema:** `supabase start` (local Docker), `migration new`/`up`, `db reset`, and
  `gen types typescript --local` after every migration.

## This repo's conventions

- **`src/lib/supabase/{client,server,middleware}.ts`** — `client.ts` = `createBrowserClient`;
  `server.ts` = `createServerClient(cookies())` with the **`get`/`set`/`remove`** cookie methods
  (see the delta note); `middleware.ts` threads the per-request **CSP nonce** onto the forwarded
  request headers and rebuilds the response on cookie refresh. All read `config.supabase.{url,anonKey}`.
- **`src/lib/auth/session.ts`** — `getSession()` returns the current user via **`supabase.auth
.getUser()`** (verified), or `null` when Supabase isn't configured. Import this — don't call
  `auth.getSession()`. **`src/lib/auth/actions.ts`** = the `"use server"` `signOut`;
  **`strategy.ts`** = the single `SUPABASE` `AuthStrategy` (ADR 0002).
- **`src/middleware.ts`** — the single auth gate: builds the CSP, creates the middleware client, calls
  `auth.getUser()`, then delegates to the **pure** `routeAccess(pathname, Boolean(user))`
  (`src/lib/route-access.ts`). Dev-only `authDisabled` lets everything through; **production without
  Supabase fails CLOSED** (see `src/config.ts`). Don't re-gate in pages.
- **`src/env.ts`** — env is zod-validated and every var is `NEXT_PUBLIC_*` today (no server secret).
  Its header documents the rule: **when a server-only secret is added, split into separate server and
  client schemas** so the secret is never referenced from — and thus never inlined into — the client
  bundle. Follow that when the service-role key lands.
- **`supabase/config.toml`** — local CLI config; **`enable_signup = false`** (no self-serve signup —
  staff accounts are provisioned by an Engineer/Admin, ADR 0007 / SRS §1). Ports: API `54321`, DB
  `54322`, Studio `54323`.
- **Posts/staging table (ADR 0006):** its identifier is **configurable** so a deployment can point at
  the analytics team's own table. **Never create or hard-code that table** — reference it through the
  configured identifier. (T2 wires this; it isn't in `env.ts` yet.)
- **`database.types.ts` is generated** by `pnpm db:types` — never hand-edit it (it's coverage-excluded
  in `vitest.config.ts`).

## Banned / outdated

- **Service-role / secret keys are SERVER-ONLY** — never `NEXT_PUBLIC_*`, never referenced from a
  `"use client"` file. Handle secrets via the split env schema.
- **Never trust `getSession()` / client metadata** for authorization — the boundary is
  `auth.getUser()` (+ RLS). Import `getSession()` from `src/lib/auth/session.ts`, which uses `getUser`.
- **RLS is not optional** — an exposed table without RLS is publicly readable via the anon key.
- **Don't create the analytics team's posts table**, and **don't hand-edit `database.types.ts`**.
- **Don't adopt on this pin** — `getClaims()`, two-arg `setAll(...)`, the "Proxy" middleware rename,
  or the `sb_publishable_/sb_secret_` key format.
- **Don't re-implement auth gating in pages** — it's centralized in `middleware.ts`.

## Common tasks

- **Read the current user server-side:** `const user = await getSession()` (from
  `src/lib/auth/session.ts`) — never `supabase.auth.getSession()`.
- **Add a table (T2):** write a migration, `enable row level security`, add `to authenticated`
  policies using `(select auth.uid())`, then `pnpm db:reset` and `pnpm db:types`.
- **Wire a Supabase-backed service:** make the seam service (`src/services/*`) call the server client;
  keep reads in RSC and writes in `"use server"` actions (see the `nextjs-15-app-router` skill).
- **Introduce a server secret:** split `src/env.ts` into server/client schemas per its header note;
  keep the secret out of anything `NEXT_PUBLIC_`.

## Refresh

1. Re-run **`/research`** against supabase.com/docs (server-side/nextjs, creating-a-client,
   row-level-security, api-keys, local-development, the CLI reference, gen-types, database-migrations)
   — **pin to `@supabase/ssr` 0.6 / supabase-js 2.49** and flag newer idioms.
2. Update [`references/supabase-docs.md`](references/supabase-docs.md) — digest, **Official sources**,
   and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when `@supabase/ssr` or `supabase-js` changes a relevant version** — re-verify
   `getUser`/`getClaims`, the cookie interface (`get/set/remove` vs `getAll/setAll`), and the key model.
