---
name: react-hook-form
description: Use when building or reviewing forms in this repo — enforces React Hook Form v7 idioms (useForm, register vs Controller, zodResolver, the formState Proxy rule) and this repo's two form patterns (RHF client forms vs Server-Action forms); keeps us aligned with current RHF docs.
---

# React Hook Form v7 (stack alignment)

Keep this repo's forms aligned with **React Hook Form v7 + `zodResolver`**, and know **when not to
use it**. The distilled, cited docs live in
[`references/react-hook-form-docs.md`](references/react-hook-form-docs.md); the wiring is the shadcn
`Form` wrapper in [`src/components/ui/form.tsx`](../../../src/components/ui/form.tsx) and the auth /
settings forms under [`src/components/auth/`](../../../src/components/auth). Validation is the
[`zod`](../zod/SKILL.md) skill's job; the Server-Action alternative is the
[`react-19`](../react-19/SKILL.md) / [`nextjs-15-app-router`](../nextjs-15-app-router/SKILL.md) skills.

## When to use

- Building a **client-side** form that validates and calls an API directly (auth, settings/profile).
- Reviewing a diff touching `src/components/ui/form.tsx`, an RHF form, or a `zodResolver` schema.
- Deciding **which form pattern** a new screen should use (see the fork below).
- Any time a controlled Radix/shadcn input (Select, Checkbox) needs to join a form.

## Pinned version

From `package.json`: `react-hook-form ^7.55.0`, `@hookform/resolvers ^4.1.3` (paired with `zod ^3`).
**Aligned to RHF v7 — refresh if the major bumps.** Do **not** adopt the `zod/v4` resolver import path
or resolvers-v5 idioms on this pin (see the `zod` skill).

## The fork: two form patterns in this repo

- **RHF + `zodResolver` (client form):** for forms that run **client-side** and call an API/SDK
  directly — the **auth and settings** forms (sign-in, reset/update password, profile). They own their
  own `pending`/error UI via `formState`.
- **Server Action + `useActionState` + `FormData` (seam write):** for **mutations through the Service
  Seam** — the Customers create/edit flow (`customer-form.tsx` → `actions.ts`). This path does **not**
  use RHF; it validates the same zod schema server-side. Prefer this for data mutations (ADR 0004).

Pick RHF for interactive client forms; pick the Server-Action path for seam-writing mutations.

## Current idioms (RHF v7)

Sourced + cited in [`references/react-hook-form-docs.md`](references/react-hook-form-docs.md):

- **`useForm({ resolver: zodResolver(schema), defaultValues })`** — validate through zod; errors land
  in `formState.errors` by field name.
- **`register` for uncontrolled** native inputs (`{...register("name")}`), **`Controller` for
  controlled** components (Radix/shadcn `Select`/`Checkbox`) — never spread `register` onto those.
- **`handleSubmit(onValid, onInvalid?)`** — async `onValid` is first-class; `isSubmitting` gates the
  submit button; surface server failures via `setError`.
- **formState Proxy rule** — destructure the exact fields you read **before render** to subscribe; for
  `useEffect`, depend on the whole `formState`.
- Constraints live in the **zod schema**, not duplicated in `register` rules.

## This repo's conventions

- **`src/components/ui/form.tsx`** — the shadcn `Form` wrapper: `Form = FormProvider`, plus
  `FormField` (wraps RHF `Controller`), `FormItem`, `FormLabel`, `FormControl`, `FormDescription`,
  `FormMessage`. This is how fields are composed — don't hand-wire `Controller` when `FormField` fits.
- **`src/components/auth/sign-in-form.tsx`** — the reference RHF form: a local `z.object` schema →
  `type Values = z.infer<typeof schema>` → `useForm<Values>({ resolver: zodResolver(schema),
defaultValues })` → `<Form {...form}>` + `<form onSubmit={form.handleSubmit(onSubmit)}>` +
  `<FormField control={form.control} name=… render={({ field }) => <Input {...field} />} />`, with a
  `pending` state disabling the button and `toast` for backend errors.
  **`src/components/dashboard/settings/profile-form.tsx`** follows the same shape.
- **`src/components/dashboard/customer/customer-form.tsx`** — the **counter-example**: a seam write, so
  it uses `useActionState(action, INITIAL)` + `<form action={formAction}>` + `FormData`, **not** RHF.
  Match this for mutations; don't convert it to RHF.
- **Validation is shared with zod** — the same schema shape validates the client form and (for seam
  writes) the Server Action (`src/app/(app)/customers/actions.ts` uses `safeParse` +
  `flatten().fieldErrors`).

## Banned / outdated

- **Don't spread `register` onto controlled inputs** — use `Controller`/`FormField`.
- **Don't duplicate validation** — express rules in the zod schema, not in `register` and the schema.
- **Don't read `formState` fields conditionally/after render** — the Proxy won't subscribe; destructure
  up front.
- **Don't reach for RHF on a seam-writing mutation** — use the Server-Action + `useActionState` path.
- **Don't treat RHF's `<Form action={url}>` as a React 19 Server Action** — its `action` is a URL
  endpoint, not a server function.
- **Don't adopt the `zod/v4` resolver import** on this pin — `import { z } from "zod"`.

## Common tasks

- **A client form:** define a zod schema + `z.infer` type, `useForm({ resolver: zodResolver(schema),
defaultValues })`, compose fields with `FormField`/`FormControl`, submit via
  `handleSubmit(onValid)`, gate the button with `isSubmitting`. Copy `sign-in-form.tsx`.
- **A controlled field (Select/Checkbox):** wrap it in `FormField` → `Controller`, binding
  `field.value`/`field.onChange` to the component's `value`/`onValueChange` (or `checked`/`onCheckedChange`).
- **A seam-writing form:** use the Server-Action + `useActionState` pattern instead (see
  `customer-form.tsx` and the `nextjs-15-app-router` skill).

## Refresh

1. Re-run **`/research`** against react-hook-form.com/docs (useForm, register, handleSubmit, formState,
   Controller, form) + the `@hookform/resolvers` README — **pin to v7 / resolvers v4** and flag
   resolvers-v5 / `zod/v4` idioms.
2. Update [`references/react-hook-form-docs.md`](references/react-hook-form-docs.md) — digest,
   **Official sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when RHF changes major** (v7 → v8) or when the resolvers major bumps.
