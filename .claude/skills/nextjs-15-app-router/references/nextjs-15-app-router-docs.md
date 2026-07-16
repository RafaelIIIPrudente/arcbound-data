# Next.js 15 App Router — docs digest

**Pinned to:** Next.js 15 — `next ^15.5.7`, `eslint-config-next ^15.5.7`; dev
`next dev --turbopack`; `output: "standalone"` (see the repo `package.json` / `next.config.ts`).
Refresh if the major bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT Next 15 App Router model — a
summary with citations, not a copy of the docs.

> **Pinning caveat:** nextjs.org now serves **Next 16** docs and redirects several older URLs.
> Every claim below is pinned to **Next 15** (via the version-history tables + the Next 15
> release blog). Three Next-16-only idioms are flagged inline — **do not adopt them on 15.5.7**:
> `error.tsx` `reset` → `unstable_retry`; `middleware.ts` → `proxy.ts`; the caching model →
> `use cache` / Cache Components.

**Official sources:**

- <https://nextjs.org/docs/app/getting-started/server-and-client-components>
- <https://nextjs.org/docs/app/getting-started/mutating-data>
- <https://nextjs.org/docs/app/api-reference/file-conventions/route>
- <https://nextjs.org/docs/app/getting-started/layouts-and-pages>
- <https://nextjs.org/docs/app/api-reference/file-conventions/loading>
- <https://nextjs.org/docs/app/getting-started/error-handling>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata>
- <https://nextjs.org/docs/app/guides/caching-without-cache-components>
- <https://nextjs.org/docs/app/api-reference/file-conventions/proxy> (redirected from `.../middleware`)
- <https://nextjs.org/docs/app/api-reference/config/next-config-js>
- <https://nextjs.org/blog/next-15>

---

## Server vs Client Components

- Layouts and pages are **Server Components by default**
  (<https://nextjs.org/docs/app/getting-started/server-and-client-components>). Server Components
  can `async/await`, hit DBs/APIs, and use secrets without exposing them; they **cannot** use
  state, effects, event handlers, browser APIs, or React Context.
- **`"use client"`** goes at the **top of the file, above imports**, and marks a **boundary**:
  the file and everything it imports/renders join the client bundle — don't repeat it in every
  child. Push it to the **leaf/interactive** components to shrink the bundle.
- **Passing server data down:** via props (must be **serializable**), or stream a promise with
  React `use()`. A Server Component passed as **`children`** to a Client Component renders on
  the server and is **not** pulled into the client graph (the "slot" pattern).
- Context providers are Client Components rendered as deep as possible. Guard secrets with the
  **`server-only`** package; only **`NEXT_PUBLIC_`** env vars reach the browser.

## Server Actions

- An async function with **`"use server"`** (inline in the function body, or at the top of a
  file to mark all exports) (<https://nextjs.org/docs/app/getting-started/mutating-data>).
  Client Components can't define actions — import them or receive them as props.
- **Forms:** `<form action={createPost}>` — the action receives `FormData` automatically; always
  POST; wired forms run in a transition; Server Component forms get **progressive enhancement**.
- **`useActionState(action, initialState)`** → `[state, formAction, pending]`; model **expected
  errors as return values**, not thrown exceptions
  (<https://nextjs.org/docs/app/getting-started/error-handling>).
- After a mutation: **`revalidatePath`/`revalidateTag`** (`next/cache`) and/or **`redirect`**
  (`next/navigation`) — revalidate **before** redirecting (redirect throws). `cookies()` /
  `headers()` from `next/headers` are **async** (`await`).
- **Security (critical):** actions are **public HTTP endpoints reachable by direct POST** —
  verify auth **and** authorization **inside every action**, check ownership, validate/sanitize
  input, never trust client input. Next 15 hardened this with unguessable action IDs +
  dead-code elimination of unused actions (<https://nextjs.org/blog/next-15>).

## Route Handlers

- `route.ts` in a segment; export functions named for HTTP methods (`GET`/`POST`/…). The
  `request` is a **`NextRequest`**; read body via `request.json()`/`.formData()`; query via
  `request.nextUrl.searchParams` (<https://nextjs.org/docs/app/api-reference/file-conventions/route>).
- **Next 15 deltas:** `GET` handlers are **no longer cached by default** (opt in with
  `export const dynamic = 'force-static'` or `export const revalidate = 60`); `context.params`
  is now a **Promise** (`await params`).
- **Route Handler vs Server Action:** Route Handlers for public/external APIs, webhooks, CORS,
  streaming, and non-UI responses; Server Actions for in-app form/component mutations. A
  `route.ts` **cannot coexist with `page.tsx`** in the same segment.

## Layouts / pages / file conventions

- **`page.tsx`** = route UI; **`layout.tsx`** = shared wrapper around `children` that **preserves
  state and does not re-render on navigation**. The **root `app/layout.tsx` is required and must
  render `<html>` + `<body>`** (replaces `_app`/`_document`)
  (<https://nextjs.org/docs/app/getting-started/layouts-and-pages>). `template.tsx` is like a
  layout but **remounts** per navigation.
- **`loading.tsx`** — Suspense-backed instant loading UI, auto-wrapping the segment's page.
- **`error.tsx`** — **must be `"use client"`**; error boundary around the segment; receives
  **`{ error, reset }`** on Next 15 (`error` is `Error & { digest?: string }`; `reset()`
  retries). Doesn't catch errors in its own same-segment layout (put the boundary in the
  parent), nor event-handler/async errors. **⚠️ Next 16 renames `reset` → `unstable_retry` — keep
  `reset` on 15.5.7** (<https://nextjs.org/docs/app/getting-started/error-handling>).
- **`global-error.tsx`** — root-level boundary, **also `"use client"`**, **must render its own
  `<html>`/`<body>`** (it replaces the root layout).
- **`not-found.tsx`** + **`notFound()`** from `next/navigation` render the segment 404.
- **Async `params`/`searchParams` (Next 15 breaking change):** `params` (in
  page/layout/route/`generateMetadata`) and `searchParams` (in page) are **Promises** —
  `const { id } = await params`. Reading `searchParams` opts into dynamic rendering; layouts get
  `params` but not `searchParams`; client reads query via `useSearchParams`. Typed
  `PageProps<'/route'>` / `LayoutProps<'/route'>` helpers are generated (15.5.x)
  (<https://nextjs.org/blog/next-15>).

## Metadata API

- **Static `export const metadata: Metadata`** or **`generateMetadata`** — from a `layout.tsx`
  or `page.tsx` **Server Component** only
  (<https://nextjs.org/docs/app/api-reference/file-conventions/metadata>).
- **Metadata file conventions** (static asset or `.ts/.tsx` generator; Next hashes them and
  injects the `<head>` tags): `icon`/`apple-icon`, `opengraph-image`/`twitter-image`,
  `manifest`, `sitemap`, `robots`. These special routes **stay static/cached by default** even
  in Next 15 unless they use dynamic APIs (<https://nextjs.org/blog/next-15>).

## Caching & revalidation (Next 15) — CRITICAL DELTA

- **`fetch` is NOT cached by default in Next 15** (changed from Next 13/14). Opt in per request:
  `fetch(url, { cache: 'force-cache' })` or `fetch(url, { next: { revalidate: 3600 } })`; opt
  out with `cache: 'no-store'` (<https://nextjs.org/docs/app/guides/caching-without-cache-components>,
  <https://nextjs.org/blog/next-15>).
- The 13/14→15 shift to **uncached-by-default** also covers **`GET` Route Handlers** and the
  **Client Router Cache** (`staleTime: 0` for page segments → navigation shows fresh data;
  restore old behavior via `experimental.staleTimes`).
- **Four layers:** Request Memoization (dedupes identical `fetch` within one render — automatic),
  Data Cache, Full Route Cache, Router Cache. For non-`fetch`/DB reads, dedupe within a render
  with React **`cache()`**, and cache across requests with **`unstable_cache(fn, keys, { tags,
revalidate })`** (`next/cache`).
- **Segment config:** `export const dynamic = 'auto'|'force-dynamic'|'error'|'force-static'`;
  `export const revalidate = false|0|number` (lowest across layouts+page wins).
- **On-demand:** `revalidateTag('user')` (tag fetches with `next: { tags: ['user'] }`) and
  `revalidatePath('/x')` — calling either **during render throws** in Next 15.
- **⚠️ Next 16 note:** the live page is "Caching and Revalidating (Previous Model)"; Next 16 adds
  Cache Components + a **`use cache`** directive — **not** the Next 15 model. Stick to the
  fetch-options / `unstable_cache` / segment-config model on 15.5.7.

## Middleware

- **`middleware.ts`** at the project root or inside `src/` (same level as `app`); export
  `middleware(request: NextRequest)` (<https://nextjs.org/docs/app/api-reference/file-conventions/proxy>).
- **`export const config = { matcher: [...] }`** scopes it (without a matcher it runs on every
  request); use negative-lookahead patterns like
  `'/((?!api|_next/static|_next/image|favicon.ico).*)'`. Matchers support `has`/`missing` and
  must be statically analyzable.
- Return **`NextResponse.next()`** / **`.redirect(new URL('/x', request.url))`** / **`.rewrite(...)`**
  or a `Response` directly. Thread request headers via `NextResponse.next({ request: { headers } })`;
  `request.cookies`/`response.cookies` for cookies; `event.waitUntil(...)` for background work.
- **Runtime:** Edge by default; the **Node.js runtime for middleware is stable in v15.5**.
- **Security:** a matcher that excludes a path also **skips Server Action POSTs** there — never
  rely on middleware alone; authorize inside each action. **⚠️ Next 16 renames the convention to
  `proxy.ts` — keep `middleware.ts` on 15.5.7.**

## next.config

- **`next.config.ts`** (TS support added in Next 15; also `.js`/`.mjs`) — type with
  `import type { NextConfig } from "next"`
  (<https://nextjs.org/docs/app/api-reference/config/next-config-js>).
- **`output: 'standalone'`** for self-contained Docker/self-host builds (Next 15 also bundles
  `sharp` automatically).
- Async **`headers()`** for security/custom headers (e.g. `X-Frame-Options`, CSP, CORS); async
  `redirects()` / `rewrites()`; `images.remotePatterns` for `next/image`.
- **Turbopack dev is stable** in Next 15 (`next dev --turbopack`); config via the `turbopack`
  key. Other Next 15 options: `serverExternalPackages` (renamed), `expireTime`, `typedRoutes`,
  stable `instrumentation.js`, experimental `after`/`reactCompiler`
  (<https://nextjs.org/blog/next-15>).
