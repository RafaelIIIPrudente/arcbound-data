---
name: zod
description: Use when validating input or parsing external data in this repo — enforces Zod v3 idioms (safeParse at boundaries, z.infer types, refine, flatten for form errors) and this repo's server-action / env-validation conventions; keeps us aligned with current Zod docs.
---

# Zod v3 (stack alignment)

Keep this repo's validation aligned with **Zod v3** — the boundary guard for env, Server-Action input,
and forms. The distilled, cited docs live in [`references/zod-docs.md`](references/zod-docs.md); the
canonical uses are [`src/env.ts`](../../../src/env.ts) and
[`src/app/(app)/customers/actions.ts`](<../../../src/app/(app)/customers/actions.ts>). Forms pair zod
with the [`react-hook-form`](../react-hook-form/SKILL.md) skill via `zodResolver`.

## When to use

- Parsing anything from outside the type system — env vars, `FormData`, JSON, query params.
- Validating **Server-Action input before calling the Service Seam** (per `AGENTS.md`).
- Building or reviewing a form schema (`zodResolver`).
- Any time a value is trusted without validation, or a v4-only idiom is tempting.

## Pinned version

From `package.json`: `zod ^3.24.2` (+ `@hookform/resolvers ^4.1.3`). **Aligned to Zod v3 — refresh if
the major bumps.** zod.dev now defaults to **v4**; v3 lives at `v3.zod.dev`. Do **not** adopt v4-only
idioms (`z.email()` top-level, `z.treeifyError()`, the unified `error` param, `import "zod/v4"`) on
this pin — see the DO-NOT-ADOPT list in the digest.

## Current idioms (Zod v3)

Sourced + cited in [`references/zod-docs.md`](references/zod-docs.md):

- **`.safeParse()` at boundaries** — returns `{ success, data | error }` (never throws); `.parse()`
  throws a `ZodError`. Prefer `safeParse` where you want to return errors, not throw.
- **Derive types with `z.infer<typeof Schema>`** — one schema is the source of both runtime validation
  and the static type. `z.input`/`z.output` when a transform/`coerce` makes them differ.
- **`z.coerce.*` for string inputs** (`FormData`, query params).
- **`.refine()` / `.superRefine()`** for custom rules; **`.flatten().fieldErrors`** to shape errors for
  form fields.
- **Validate untrusted input at the server boundary** — client validation is not a trust boundary.

## This repo's conventions

- **`src/env.ts`** — the environment is a zod schema, **fail-fast** at import: `parseEnv` runs
  `envSchema.safeParse(raw)` and throws an `Error` naming every invalid key. It uses `.optional()`,
  `.url()`, `.enum([...])`, `.literal(...)`, `.default(...)`, and a small `optionalEnv` **`z.preprocess`**
  that coerces `""` → `undefined` (so empty passes `.optional()` but a genuinely invalid value still
  fails). Export/import the typed `env` — never read `process.env` directly.
- **`src/app/(app)/customers/actions.ts`** — the Server-Action reference: a `z.object` schema,
  `customerSchema.safeParse(Object.fromEntries(formData))`, and on failure `return { ok: false, errors:
parsed.error.flatten().fieldErrors }` before ever calling the seam. New write actions copy this.
- **Form schemas** — the auth/settings forms declare a local `z.object`, derive `type Values =
z.infer<typeof schema>`, and pass `zodResolver(schema)` to `useForm` (see the `react-hook-form`
  skill). The **same schema shape validates client and server** for a given mutation.
- **`AGENTS.md`** — "Mutations live in `'use server'` actions and validate input with `zod` before
  calling the seam."

## Banned / outdated

- **Don't call the Service Seam with unvalidated input** — `safeParse` first, return
  `flatten().fieldErrors` on failure.
- **Don't hand-write a type that a schema already implies** — use `z.infer`.
- **Don't read `process.env` directly** — import the validated `env` from `src/env.ts`.
- **Don't adopt v4-only idioms on this pin** — `z.email()`/`z.url()` top-level (use
  `z.string().email()`/`.url()`), `z.treeifyError()` (use `.flatten()`/`.format()`), the unified
  `error` param (use `message`), the `zod/v4` import.
- **Don't trust client-side validation as security** — re-validate server-side.

## Common tasks

- **Validate Server-Action input:** `const parsed = schema.safeParse(Object.fromEntries(formData)); if
(!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };` then use
  `parsed.data`. Copy `customers/actions.ts`.
- **A form schema:** `const schema = z.object({ … }); type Values = z.infer<typeof schema>;` → pass
  `zodResolver(schema)` to `useForm`.
- **Coerce a numeric/boolean field:** `z.coerce.number()` / `z.coerce.boolean()` for `FormData`.
- **Add an env var:** extend `envSchema` in `src/env.ts` (wrap optional public vars in `optionalEnv`),
  and add the literal `process.env.X` to the `parseEnv({...})` object.

## Refresh

1. Re-run **`/research`** against the Zod **v3** docs (`v3.zod.dev` / the `v3`-branch README +
   ERROR_HANDLING) and the v4 changelog (to keep the DO-NOT-ADOPT list current) — **pin to v3**.
2. Update [`references/zod-docs.md`](references/zod-docs.md) — digest, **Official sources**, and
   **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when the repo moves to Zod v4** — at that point the DO-NOT-ADOPT list becomes the
   migration checklist (`z.email()`, `z.treeifyError()`, the `error` param, `zod/v4` import).
