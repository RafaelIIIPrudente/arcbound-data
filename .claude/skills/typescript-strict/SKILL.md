---
name: typescript-strict
description: Use when writing or reviewing TypeScript in this repo — enforces strict-mode idioms (unknown over any, narrowing, noUncheckedIndexedAccess, type-only imports, satisfies/as const) and this repo's tsconfig; keeps us aligned with current TypeScript docs.
---

# TypeScript strict (stack alignment)

Keep this repo's TypeScript aligned with **strict mode + this repo's extra rigor** (pinned to
TS 5.8). The distilled, cited docs live in
[`references/typescript-strict-docs.md`](references/typescript-strict-docs.md); the compiler
config is in [`tsconfig.json`](../../../tsconfig.json). The gate is `pnpm type:check`
(`tsc --pretty --noEmit`).

## When to use

- Writing or reviewing any `.ts`/`.tsx` — especially error handling, indexed/array access,
  parsing external data, generics, and type-only imports.
- Adding a typed config/registry object, a service-seam type, or env parsing.
- Any time `any`, `!`, or `as` is tempting.

## Pinned version

From `package.json`: `typescript ^5.8.2`, `@types/node ^22.13.17`. Gate: `tsc --pretty
--noEmit`. **Aligned to TS 5.8 — refresh if the major bumps** (see the Refresh section).

## Current idioms (TS 5.8)

Sourced + cited in
[`references/typescript-strict-docs.md`](references/typescript-strict-docs.md):

- **`strict` is on** — plus this repo adds **`noUncheckedIndexedAccess`** (indexed access is
  `T | undefined`), and `strict` already implies **`useUnknownInCatchVariables`** (catch vars
  are `unknown`).
- **Prefer `unknown` + narrowing over `any`.** Narrow with `typeof` / `instanceof` / `in` /
  truthiness, **type predicates** (`v is X`), and **discriminated unions** with a `never`
  `default` for exhaustiveness.
- **Type-only imports:** `import type { T } from "…"` and `export type { T }` — required by
  `isolatedModules` for type re-exports.
- **`moduleResolution: "bundler"`** — extensionless relative imports; the `@/*` alias resolves
  to `src/*`.
- **`satisfies`** for typed-but-inferred literals (keep the narrow inferred type + get a
  check); **`as const`** to freeze literal values to readonly tuples/literals.
- **Avoid `!` and `as`** where narrowing proves safety; the `expr as unknown as T` double-cast
  is a red flag.

## This repo's conventions

- **`tsconfig.json`** — `strict: true`, `noUncheckedIndexedAccess: true`,
  `useUnknownInCatchVariables: true`, `isolatedModules: true`, `module: "esnext"`,
  `moduleResolution: "bundler"`, `jsx: "preserve"`, and the path alias
  `paths: { "@/*": ["./src/*"] }`. Import via `@/…`, never long relative chains.
- **`src/env.ts`** — env is parsed and validated with **zod** (`parseEnv`) and fails fast;
  it builds an explicit object (never spreads `process.env`) and types the raw input as
  `Record<string, unknown>`. Import the typed `env`, never read `process.env` directly.
- **`src/paths.ts`** — the route registry is `as const` (typed literal routes). All links go
  through it.
- **`src/config.ts`** — the config object uses **`satisfies Config`** (checked, not widened).
- **`src/services/types.ts`** — seam types (`Customer`, `Paginated<T>`); features type against
  the seam.

**Deltas / justified exceptions:**

- The repo enables `isolatedModules` (so `export type` is required) and uses `import type` by
  convention, but does **not** enable `verbatimModuleSyntax` — follow the repo (don't add the
  flag as part of a feature).
- Non-null `!` appears only where already justified (e.g. `src/lib/supabase/middleware.ts`
  uses `config.supabase.url!` guarded by `isSupabaseConfigured`). Match that discipline — note
  a justified `!`, don't spread new ones.

## Banned / outdated

- **No `any`** — use `unknown` + narrowing (or a precise type).
- **Catch vars are `unknown`** — narrow (`err instanceof Error`) before use; don't annotate
  `catch (e: any)`.
- **Respect `noUncheckedIndexedAccess`** — treat `arr[i]` / `record[key]` as possibly
  `undefined`; guard or default before use.
- **No new non-null `!`** except a justified, commented case (as above); no `expr as unknown as
T` double-casts.
- **No raw enum tokens / type names in user-facing strings** — map internal unions to display
  labels; don't render the identifier.

## Common tasks

- **Handle a caught error:** `catch (err) { const msg = err instanceof Error ? err.message :
"Unexpected error"; … }` — never touch `err` as `any`.
- **Indexed access:** prefer destructuring/finds that return `T | undefined` and guard, or
  `const first = items[0]; if (!first) return;` before use.
- **Typed config/registry:** author the literal and add `satisfies SomeType` (or `as const`
  for a frozen registry) rather than annotating `: SomeType` and losing the inferred shape.
- **Exhaustive union handling:** `switch (x.kind) { … default: { const _e: never = x; return
_e; } }`.

## Refresh

1. Re-run **`/research`** against typescriptlang.org (the `strict`/flag tsconfig pages, the
   handbook narrowing/everyday-types pages, and the 5.x release notes).
2. Update [`references/typescript-strict-docs.md`](references/typescript-strict-docs.md) —
   digest, **Official sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`, and re-confirm the `tsconfig.json`
   flags list still matches.
4. **Bump this skill when TypeScript changes major** — re-verify flags and idioms.
