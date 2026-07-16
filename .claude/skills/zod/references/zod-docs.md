# Zod v3 — docs digest

**Pinned to:** Zod v3 — `zod ^3.24.2` (+ `@hookform/resolvers ^4.1.3` for `zodResolver`) (see the repo
`package.json`). Refresh if the major bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT Zod v3 model — a summary with citations,
not a copy of the docs.

> **Pinning caveat:** **zod.dev now defaults to Zod v4**; v3 lives at the separate `v3.zod.dev` host
> (a client-rendered SPA) and in the repo's `v3`-branch files. The digest is sourced from the v3
> README/error-handling docs; v4 was consulted **only** to list the v4-only idioms to avoid. Every
> claim below is v3 unless flagged. Do **not** adopt the v4 idioms in the DO-NOT-ADOPT list.

**Official sources:**

- <https://raw.githubusercontent.com/colinhacks/zod/v3/README.md> — Zod **v3** main docs
- <https://raw.githubusercontent.com/colinhacks/zod/v3/ERROR_HANDLING.md> — Zod **v3** error handling
- <https://raw.githubusercontent.com/colinhacks/zod/v3/package.json> — confirms v3 (`3.24.x`)
- <https://raw.githubusercontent.com/react-hook-form/resolvers/master/README.md> — `zodResolver`
- <https://zod.dev/v4/changelog> — Zod **v4** changelog (consulted only to flag v4-only idioms)
- <https://zod.dev/> — confirms zod.dev now defaults to v4

---

## Defining schemas

- Primitives: `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, plus `z.undefined()`, `z.null()`,
  `z.any()`, `z.unknown()`, `z.never()` (<…/v3/README.md>).
- Objects: `z.object({ name: z.string(), age: z.number() })`; arrays: `z.array(z.string())` /
  `z.string().array()` (<…/v3/README.md>).
- Enums: `z.enum(["a","b","c"])` — "the recommended approach"; access via `.enum.a` and `.options`
  (<…/v3/README.md>).
- Optional/nullable: `z.string().optional()` → `string | undefined`; `.nullable()` → `string | null`.
  Defaults: `z.string().default("x")` returns the default when input is `undefined` (a function gives a
  dynamic default) (<…/v3/README.md>).
  - **Do not adopt on v3:** v4 changes `.default()` to short-circuit on `undefined` and require the
    **output** type (<https://zod.dev/v4/changelog>).

## parse vs safeParse

- **`.parse(data)`** — returns a typed deep clone on success; **throws a `ZodError`** on failure.
- **`.safeParse(data)`** — never throws; returns a discriminated union `{ success: true; data }` **or**
  `{ success: false; error: ZodError }`. Narrow with `if (!result.success) …`.
- Async schemas (async refinements/transforms): `.parseAsync()` / `.safeParseAsync()`
  (<…/v3/README.md>).

## Type inference

- **`type T = z.infer<typeof Schema>`** extracts the static type. For schemas with transforms, input ≠
  output: `z.input<typeof s>` vs `z.output<typeof s>`, and `z.infer` equals the **output** type. (All
  three exist in v3 — **not** v4-only) (<…/v3/README.md>).

## refine / superRefine

- `.refine(check, { message })` for one custom rule; async predicates allowed (needs `.parseAsync`).
- `.superRefine((val, ctx) => { ctx.addIssue({ code: z.ZodIssueCode.custom, message, fatal: true });
return z.NEVER; })` — add multiple issues, abort early with `fatal: true` + `return z.NEVER`
  (<…/v3/README.md>).

## Coercion

- `z.coerce.string()` → `String(input)`, `z.coerce.number()` → `Number(input)`, also `.boolean()`,
  `.bigint()`, `.date()`. Useful for `FormData` (all strings) and query params
  (<…/v3/README.md>).
  - **Do not adopt on v3:** v4 widens `z.coerce.*` **input** type to `unknown`
    (<https://zod.dev/v4/changelog>).

## Error handling (ZodError / issues / format / flatten)

- `ZodError extends Error` and carries `issues: ZodIssue[]`; each issue has `code`, `path`
  (`(string|number)[]`), and `message` (<…/v3/ERROR_HANDLING.md>).
- **`.flatten()`** → `{ formErrors: string[], fieldErrors: Record<string,string[]> }` — best for flat
  object schemas (the repo's Server-Action pattern). **`.format()`** → a nested object mirroring the
  data shape with `_errors` arrays — good for nested form display (<…/v3/ERROR_HANDLING.md>).
  - **Do not adopt on v3:** v4 **deprecates** `.format()`/`.flatten()` in favor of top-level
    `z.treeifyError()`, and unifies error customization under a single `error` param (replacing
    `message`/`errorMap`/`invalid_type_error`/`required_error`) (<https://zod.dev/v4/changelog>).

## Server-Action + zodResolver interop

- **Server-Action boundary** (a docs pattern, not a special API): treat the payload as untrusted,
  `safeParse` it, and on `!result.success` return serializable errors (e.g.
  `result.error.flatten().fieldErrors`) rather than throwing; use `z.coerce.*` for `FormData`
  (<…/v3/README.md>, <…/v3/ERROR_HANDLING.md>).
- **React Hook Form:** `import { zodResolver } from "@hookform/resolvers/zod"` + `import { z } from
"zod"`, then `useForm({ resolver: zodResolver(schema) })`. The resolver distinguishes zod versions by
  **import path** — on this pin use `"zod"` (v3), **not** `"zod/v4"` (<…/resolvers/master/README.md>).

## DO-NOT-ADOPT list (v4-only — this repo is on v3)

- `z.email()` / `z.uuid()` / `z.url()` top-level → v3 uses `z.string().email()` / `.uuid()` / `.url()`.
- Unified `error` param replacing `message` / `errorMap` / `invalid_type_error` / `required_error`.
- `z.treeifyError()` replacing deprecated `.format()` / `.flatten()`.
- `z.coerce.*` input widened to `unknown`; `.default()` output-type/short-circuit semantics.
- `import { z } from "zod/v4"` → use `import { z } from "zod"`.
- (Note: `z.output` / `z.input` / `z.infer` are **not** v4-only — safe in v3.)
