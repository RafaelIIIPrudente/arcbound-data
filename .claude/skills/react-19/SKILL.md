---
name: react-19
description: Use when writing or reviewing React components in this repo — enforces React 19 idioms (Actions/useActionState, ref-as-prop, the use() API) and this repo's RSC-first conventions; keeps us aligned with current react.dev docs.
---

# React 19 (stack alignment)

Keep this repo's React aligned with **React 19**. The distilled, cited docs live in
[`references/react-19-docs.md`](references/react-19-docs.md). RSC/Server-Action wiring is
owned by Next 15 — see the [`nextjs-15-app-router`](../nextjs-15-app-router/SKILL.md) skill;
this skill is about component/hook idioms.

## When to use

- Writing or reviewing any component or hook under `src/components` / `src/app`.
- Building a **form** (client interactivity over a Server Action).
- Reaching for a ref, context, or async data in a client component.
- Any time a pre-19 pattern is tempting (`forwardRef`, `propTypes`, string refs).

## Pinned version

From `package.json`: `react ^19.1.0`, `react-dom ^19.1.0`, `@types/react ^19.1.0`,
`@types/react-dom ^19.1.1`. **Aligned to React 19 — refresh if the major bumps** (see the
Refresh section).

## Current idioms (React 19)

The modern, correct way (sourced + cited in
[`references/react-19-docs.md`](references/react-19-docs.md)):

- **Actions & forms:** `<form action={fn}>`; drive form state with
  `useActionState(action, initial)` → `[state, formAction, isPending]`; read parent-form
  pending state in a child button with `useFormStatus()`.
- **`useOptimistic`** for optimistic UI during an async action.
- **`use(promise | context)`** — may be called conditionally; suspends on a (stable) promise
  under a `<Suspense>` boundary; not for reading context in Server Components.
- **ref-as-a-prop:** function components take `ref` as a normal prop — **no `forwardRef`**.
  Callback refs may return a cleanup function.
- **Document Metadata** hoists natively — but in this app, page metadata goes through Next's
  Metadata API, not hand-rendered `<title>`/`<meta>`.
- **Removed:** `propTypes`/`defaultProps` on function components, legacy context, string refs.
- **Provider shorthand:** `<Context value={…}>` (the `<Context.Provider>` form is deprecating).

## This repo's conventions

- **Server Action forms are the write pattern** (ADR 0004). Reference:
  `src/components/dashboard/customer/customer-form.tsx` uses
  **`useActionState`** against a `"use server"` action in
  `src/app/(app)/customers/actions.ts` (zod-validated, returns field errors as state). New
  interactive write flows (T3 Add-Client, T4 upload) copy this shape.
- **RSC by default; `"use client"` only where needed** — reads happen in Server Components
  through the Service Seam; client components are the interactive leaves (forms, toggles).
- **Theme:** `src/components/theme/theme-provider.tsx` wraps `next-themes`;
  `mode-toggle.tsx` switches. Don't hand-roll theme state.
- **Toasts:** `src/components/ui/sonner.tsx` (`Toaster`, themed via `next-themes`); surface
  feedback with `toast()` from `sonner`.
- **ref-as-prop throughout** — the repo has **zero `forwardRef`** (the vendored shadcn/ui
  primitives already take `ref` as a prop). Keep it that way.

## Banned / outdated

- **No `forwardRef`** where ref-as-prop works (it's deprecating) — take `ref` as a prop.
- **No `propTypes` / `defaultProps`** on function components — use TS types + default params.
- **No legacy context** (`contextTypes`/`childContextTypes`) or **string refs** — use
  `createContext` and `useRef` / callback refs.
- **Don't hand-roll form submission state** (manual `useState` + `onSubmit` + `preventDefault`)
  where a Server Action + `useActionState` fits — that's the repo pattern.
- **No reading Context via `use()` in Server Components**; no server secrets in client
  components (see the `nextjs-15-app-router` skill).

## Common tasks

- **Form over a Server Action:** define a `"use server"` action `(prev, formData) => state`
  (zod-validate first); in the client form call
  `const [state, formAction, pending] = useActionState(action, INITIAL)` and render
  `<form action={formAction}>`; show `state.errors` inline and disable submit while `pending`.
- **Pending in a submit button:** call `useFormStatus()` from a button component rendered
  **inside** the form.
- **Ref to a DOM node from a custom component:** accept `ref` as a prop and forward it — no
  `forwardRef`.
- **User feedback:** `toast.success(...)` / `toast.error(...)` from `sonner`.

## Refresh

1. Re-run **`/research`** against react.dev (release notes, `useActionState`, `useFormStatus`,
   `useOptimistic`, `use`, the `<form>` reference, hooks index).
2. Update [`references/react-19-docs.md`](references/react-19-docs.md) — digest, **Official
   sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when React changes major** (19 → 20): re-verify every idiom.
