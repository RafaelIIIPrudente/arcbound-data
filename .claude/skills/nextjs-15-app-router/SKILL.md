---
name: nextjs-15-app-router
description: Use when writing or reviewing App Router code in this repo — enforces Next.js 15 idioms (RSC reads / Server-Action writes, async params, uncached-by-default fetch, Route Handlers, Metadata API) and this repo's routing/middleware conventions; keeps us aligned with current Next.js 15 docs.
---

# Next.js 15 App Router (stack alignment)

Keep this repo's App Router code aligned with **Next.js 15** (pinned — the live docs have moved
to Next 16). The distilled, cited docs live in
[`references/nextjs-15-app-router-docs.md`](references/nextjs-15-app-router-docs.md); the wiring
is in [`src/app/`](../../../src/app), [`src/middleware.ts`](../../../src/middleware.ts), and
[`next.config.ts`](../../../next.config.ts).

## When to use

- Adding or reviewing a route, layout, page, `loading`/`error`/`not-found`, Route Handler, or
  Server Action.
- Fetching or mutating data on a screen (RSC read / Server-Action write).
- Touching `middleware.ts`, `next.config.ts`, or the metadata files.
- Any time a Pages-Router or implicit-caching assumption creeps in.

## Pinned version

From `package.json`: `next ^15.5.7`, `eslint-config-next ^15.5.7`; dev `next dev --turbopack`;
`output: "standalone"`. **Aligned to Next 15 — refresh if the major bumps** (see the Refresh
section). Do **not** adopt Next 16 idioms (`proxy.ts`, `error.tsx` `unstable_retry`, `use
cache`/Cache Components) on this pin.

## Current idioms (Next 15)

Sourced + cited in
[`references/nextjs-15-app-router-docs.md`](references/nextjs-15-app-router-docs.md):

- **RSC by default; `"use client"` at a leaf boundary.** Pass server data down as **serializable
  props**; render Client Components as deep as possible. Secrets stay server-side; only
  `NEXT_PUBLIC_` env reaches the browser.
- **Reads = RSC, writes = Server Actions** (`"use server"`): a form `action` receives `FormData`;
  drive it with `useActionState`; model **expected errors as return values**; `revalidatePath` /
  `revalidateTag` then `redirect`. **Authorize + validate inside every action** (they're public
  endpoints).
- **Async `params`/`searchParams`** — they're Promises: `const { id } = await params`.
- **`fetch` is NOT cached by default** in Next 15 (vs 13/14) — opt in with `cache: 'force-cache'`
  / `next: { revalidate }`; use React `cache()` / `unstable_cache` for non-`fetch` reads.
- **Route Handlers** (`route.ts`) for non-UI / callback / external endpoints; **`GET` is uncached
  by default**; `params` is a Promise.
- **Metadata API** — `export const metadata` / `generateMetadata` from Server Components; the
  metadata files (`icon`, `opengraph-image`, `manifest`, `sitemap`, `robots`) stay static.
- **`error.tsx`** is `"use client"` with `{ error, reset }`; **`global-error.tsx`** renders its
  own `<html>`/`<body>`. Middleware lives at **`middleware.ts`**.

## This repo's conventions

- **Routing** — flat, auth-gated routes under the `(app)` shell group in `src/app/` (`/`,
  `/clients`, `/clients/[id]`, `/upload`, `/resources`), plus `/login` and the retained
  `auth/*`. Links go through `src/paths.ts`, never hard-coded.
- **`src/app/layout.tsx`** — the required root layout (renders `<html>`/`<body>`); loads fonts
  via `next/font`, wraps `ThemeProvider`, sets metadata from `src/config.ts`, and `await
headers()` to force per-request (dynamic) rendering so the CSP nonce applies.
- **`src/middleware.ts`** — the single auth gate (pure policy in `src/lib/route-access.ts`) **and**
  the per-request **nonce-based CSP**. Route protection is centralized here — don't re-gate in
  pages. Static/CSP-free security headers live in `next.config.ts`.
- **Writes** — `"use server"` actions: `src/app/(app)/customers/actions.ts` is the reference
  (zod-validate → Service Seam → `revalidatePath` → `redirect`); `src/lib/auth/actions.ts` is
  the sign-out action. New write flows (T3/T4) copy this.
- **Route Handler** — `src/app/auth/callback/route.ts` (`GET`, exchanges the auth code).
- **Metadata** — `manifest.ts`, `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`, `icon.tsx`,
  `apple-icon.tsx`; error/loading via `error.tsx`, `global-error.tsx`, `not-found.tsx`.
- **`next.config.ts`** — `output: "standalone"` + static security headers (CSP is intentionally
  in middleware, since it needs the per-request nonce).
- **Data pattern (ADR 0004 / `AGENTS.md`)** — **Reads = RSC, writes = Server Actions**; reads go
  through the Service Seam (`src/services/*`), never a direct DB/`fetch` call in a component.

## Banned / outdated

- **No Pages-Router patterns** — `getServerSideProps` / `getStaticProps` / `_app` / `_document`.
- **Never fetch app data directly in components** — go through the Service Seam.
- **Never reference server secrets from a Client Component** (no `SUPABASE_SERVICE_ROLE_KEY` etc.
  in `"use client"` files); only `NEXT_PUBLIC_` is client-safe.
- **Don't assume implicit fetch caching** — Next 15 is uncached by default; be explicit.
- **Don't hand-roll per-page auth gating** — it's centralized in `middleware.ts`.
- **Don't adopt Next 16 idioms** on this pin (`proxy.ts`, `unstable_retry`, `use cache`).

## Common tasks

- **Add a screen:** a Server Component `page.tsx` in a segment under `(app)/`; read through the
  Service Seam; add a `loading.tsx` where useful.
- **Mutate data:** a `"use server"` action that zod-validates, calls the seam, then
  `revalidatePath(...)` and/or `redirect(...)` — invoked from a `useActionState` form (see the
  `react-19` skill).
- **A callback / non-UI endpoint:** a `route.ts` Route Handler (remember `GET` is uncached and
  `params` is a Promise).
- **Page metadata:** `export const metadata` (or `generateMetadata`) from the page/layout.
- **Read a dynamic segment:** `export default async function Page({ params }: { params:
Promise<{ id: string }> }) { const { id } = await params; … }`.

## Refresh

1. Re-run **`/research`** against nextjs.org (Server/Client Components, mutating-data, route
   handlers, layouts-and-pages, error-handling, metadata, caching, middleware, next-config, and
   the Next 15 release blog) — **pin to Next 15** and flag any idioms that have advanced.
2. Update [`references/nextjs-15-app-router-docs.md`](references/nextjs-15-app-router-docs.md) —
   digest, **Official sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when Next changes major** (15 → 16): re-verify the flagged deltas
   (`proxy.ts`, `unstable_retry`, `use cache`) and adopt deliberately.
