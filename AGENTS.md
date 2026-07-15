# Agent & contributor guide

Conventions for humans and coding agents working in this repo. Keep changes
consistent with what's already here.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 ·
shadcn/ui · Supabase auth · Vitest + Playwright · pnpm.

## Rules that matter

- **Data goes through the seam.** Screens and Server Actions call
  `src/services/*`. Never read mock data or call Supabase for app data directly
  from a component. Services return mock data today; making them real is a
  one-file change per service.
- **Reads = RSC, writes = Server Actions.** Server Components fetch through the
  seam. Mutations live in `'use server'` actions and validate input with `zod`
  before calling the seam. See `src/app/dashboard/customers/` as the reference.
- **Auth is Supabase-only.** Use the clients in `src/lib/supabase/*` and
  `getSession()` from `src/lib/auth/session.ts`. Roles come from the user's
  `app_metadata.role` via `src/lib/authz.ts` — never trust client-set metadata.
- **UI is shadcn/ui + Tailwind.** Add primitives with
  `pnpm dlx shadcn@latest add <name>`. Compose with `cn()`. No other UI kit.
- **Keep it typed and green.** Every change must pass `pnpm type:check`,
  `pnpm lint`, and `pnpm test`. Add a test when you add behavior.

## Where things live

- New feature → copy `customers`: `services/<name>.ts`, `app/dashboard/<name>/`,
  `actions.ts`, `components/dashboard/<name>/`.
- Routes and links → `src/paths.ts` (never hard-code paths).
- App config → `src/config.ts`; env vars → `src/env.d.ts` + `.env.example`.

## Commits & PRs

Conventional Commits (enforced by commitlint). Branch off `main`; never commit
to `main` directly. PRs should pass CI (lint, typecheck, unit, e2e, build).

## Decisions

Big, hard-to-reverse choices are in `docs/adr/`. If you make one, add an ADR.
Domain vocabulary is in `CONTEXT.md`.
