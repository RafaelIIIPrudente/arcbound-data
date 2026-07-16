# TypeScript strict — docs digest

**Pinned to:** TypeScript 5.8 — `typescript ^5.8.2`, `@types/node ^22.13.17` (see the repo
`package.json`). Gate: `tsc --pretty --noEmit`. Refresh if the major bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT TS strict-mode model and the
specific flags this repo enables — a summary with citations, not a copy of the docs.

**Official sources:**

- <https://www.typescriptlang.org/tsconfig/#strict>
- <https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess>
- <https://www.typescriptlang.org/tsconfig/#useUnknownInCatchVariables>
- <https://www.typescriptlang.org/tsconfig/#isolatedModules>
- <https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax>
- <https://www.typescriptlang.org/docs/handbook/modules/reference.html>
- <https://www.typescriptlang.org/docs/handbook/2/everyday-types.html>
- <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>
- <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html>
- <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html>

---

## What `strict` enables

- `strict` is an **umbrella** that turns on the whole strict-mode family
  (<https://www.typescriptlang.org/tsconfig/#strict>): `noImplicitAny`, `strictNullChecks`
  (null/undefined are distinct types), `strictFunctionTypes`, `strictBindCallApply`,
  `strictPropertyInitialization`, `noImplicitThis`, **`useUnknownInCatchVariables`**,
  `alwaysStrict`, and `strictBuiltinIteratorReturn`.
- `noImplicitOverride`, `noUncheckedIndexedAccess`, and `noImplicitReturns` are **not** part of
  `strict` — enable them separately (this repo enables `noUncheckedIndexedAccess`)
  (<https://www.typescriptlang.org/tsconfig/#strict>).
- Caveat (quoted): "Future versions of TypeScript may introduce additional stricter checking
  under this flag, so upgrades … might result in new type errors"
  (<https://www.typescriptlang.org/tsconfig/#strict>).

## `noUncheckedIndexedAccess`

- Adds `undefined` to any value reached through an **index signature** or indexed access —
  `arr[i]` / `record[key]` become `T | undefined` — so you must **narrow/guard** (check,
  optional-chain, or destructure with a default) before use. Only affects index access, not
  explicitly declared properties. Added in TS 4.1; NOT part of `strict`
  (<https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess>).

## `useUnknownInCatchVariables`

- Catch-clause variables are **`unknown`**, not `any` — narrow before use:
  `catch (err) { if (err instanceof Error) { … err.message … } }`. Part of the `strict` family
  since TS 4.4; on by default under `strict`
  (<https://www.typescriptlang.org/tsconfig/#useUnknownInCatchVariables>).

## Module flags

- **`isolatedModules`** enforces per-file transpile constraints so single-file transpilers
  (esbuild/swc/Babel — and Next's compiler) can process each file alone. It **flags**
  (doesn't change emit): type re-exports must use `export type { T } from "./x"`; `const enum`
  and namespace-as-value are disallowed
  (<https://www.typescriptlang.org/tsconfig/#isolatedModules>).
- **`verbatimModuleSyntax`** — deterministic rule: imports/exports **without** a `type` modifier
  are kept; anything **with** `type` is dropped. Requires explicit **`import type`** for
  type-only imports. Replaces the deprecated `importsNotUsedAsValues`/`preserveValueImports`
  (<https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax>). _(This repo does not enable
  this flag — see the delta note in `SKILL.md` — but uses `import type` by convention.)_
- **`moduleResolution: "bundler"`** models bundler resolution: `node_modules` lookups, index
  modules, **extensionless relative imports**, plus package.json `"exports"`/`"imports"`
  conditions. Must pair with `module: "esnext"` (or `preserve`). Right for esbuild/Vite/Next
  and `noEmit`; use `nodenext` for real Node apps
  (<https://www.typescriptlang.org/docs/handbook/modules/reference.html>).

## `unknown` vs `any` & narrowing

- Avoid **`any`** — it "disables all further type checking"
  (<https://www.typescriptlang.org/docs/handbook/2/everyday-types.html>). Prefer **`unknown`**
  at boundaries (caught errors, parsed JSON): it accepts any value but permits no operations
  until narrowed (<https://www.typescriptlang.org/docs/handbook/2/narrowing.html>).
- Narrowing tools: `typeof`, truthiness, equality (`== null` catches null+undefined), `in`,
  `instanceof`, control-flow analysis, and **type predicates** (`function isX(v): v is X`).
  Model variants as **discriminated unions** (a common literal `kind` tag) and add a `never`
  `default` branch for **exhaustiveness checking**
  (<https://www.typescriptlang.org/docs/handbook/2/narrowing.html>).

## `satisfies` & `as const`

- **`satisfies T`** validates an expression against `T` "without affecting the type itself" —
  you keep the precise inferred literal type while getting the check. Use for typed-but-inferred
  config/registry objects where a `: T` annotation would over-widen
  (<https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html>).
- **`as const`** freezes a value to its narrowest readonly literal type (arrays → readonly
  tuples). Rule of thumb: `as const` to freeze literal values; `satisfies` to check a
  constrained-yet-inferred value; combine for both
  (<https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html>).

## Non-null `!` and casts

- `x!` removes null/undefined but "doesn't change the runtime behavior" — only when the value
  truly can't be nullish. Prefer real narrowing so the compiler proves safety
  (<https://www.typescriptlang.org/docs/handbook/2/everyday-types.html>).
- `as` is compile-time only ("no runtime checking"); forcing unrelated types needs the
  `expr as unknown as T` double-cast — a signal you've left type safety. Use guards where they
  work (<https://www.typescriptlang.org/docs/handbook/2/everyday-types.html>).

## TS 5.8 specifics

- 5.8 checks **each branch of a `return cond ? a : b`** individually against the declared
  return type, catching mismatches that union-widening previously hid. `--erasableSyntaxOnly`
  errors on runtime-bearing TS syntax (enums, namespaces, param properties, `import =`) for
  type-stripping runtimes
  (<https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html>).
