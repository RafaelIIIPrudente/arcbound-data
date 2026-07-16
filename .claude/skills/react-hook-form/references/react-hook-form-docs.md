# React Hook Form v7 — docs digest

**Pinned to:** React Hook Form v7 — `react-hook-form ^7.55.0`, `@hookform/resolvers ^4.1.3` (see the
repo `package.json`). Paired with zod v3 (`zodResolver`) and shadcn/ui inputs. Refresh if the major
bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT RHF v7 model — a summary with citations,
not a copy of the docs.

> **Sourcing note:** react-hook-form.com returns 403 to automated fetchers (Cloudflare), so the digest
> is sourced from RHF's own documentation-repo MDX (the files that generate those pages) and the
> `@hookform/resolvers` READMEs at `master` and the `v4.1.3` tag. **Pinning caveat:** a few newer-only
> idioms are flagged **do not adopt on this pin** (the `zod/v4` resolver import path; resolvers-v5
> idioms).

**Official sources:**

- <https://raw.githubusercontent.com/react-hook-form/documentation/master/src/content/docs/useform.mdx>
- <https://raw.githubusercontent.com/react-hook-form/documentation/master/src/content/docs/useform/register.mdx>
- <https://raw.githubusercontent.com/react-hook-form/documentation/master/src/content/docs/useform/handlesubmit.mdx>
- <https://raw.githubusercontent.com/react-hook-form/documentation/master/src/content/docs/useform/formstate.mdx>
- <https://raw.githubusercontent.com/react-hook-form/documentation/master/src/content/docs/usecontroller/controller.mdx>
- <https://raw.githubusercontent.com/react-hook-form/documentation/master/src/content/docs/useform/form.mdx>
- <https://raw.githubusercontent.com/react-hook-form/resolvers/v4.1.3/README.md>
- <https://raw.githubusercontent.com/react-hook-form/resolvers/master/README.md>

---

## useForm (defaultValues, mode, resolver)

- **`defaultValues`** — a sync object or an async loader (`async () => fetch(...)`); while an async
  loader resolves, `formState.isLoading` is `true`. defaultValues are cached — reset via the `reset`
  API, not by re-passing (<…/useform.mdx>).
- **`values`** is reactive and **overwrites** `defaultValues` on change unless `resetOptions: {
keepDefaultValues: true }` — use `defaultValues` for a create form, `values`/`reset` to hydrate an
  edit form from server data (<…/useform.mdx>).
- **`mode`** (pre-submit trigger): `"onSubmit"` (default), `"onBlur"`, `"onChange"`, `"onTouched"`,
  `"all"`; `reValidateMode` (after a failed submit): `"onChange"` (default), `"onBlur"`, `"onSubmit"`
  (<…/useform.mdx>).
- **`resolver`** integrates an external schema lib — `resolver: zodResolver(schema)`; errors flow into
  `formState.errors` keyed by field name (<…/useform.mdx>).

## register vs Controller

- **`register("name")`** returns `{ name, onChange, onBlur, ref }` to spread onto a
  **native/uncontrolled** input: `<input {...register("firstName")} />`. shadcn's plain
  `Input`/`Textarea` (ref forwarded to a native element) work directly with `{...register(...)}`
  (<…/register.mdx>).
- Validation rules on `register` (`required`, `min`, `pattern`, `validate`, `valueAsNumber`, …) — but
  with `zodResolver`, **express constraints in the zod schema** and keep `register` rules minimal to
  avoid two sources of truth (<…/register.mdx>).
- **Do not spread `register` onto controlled components** (Radix/shadcn `Select`, `Checkbox`,
  `RadioGroup`, `Switch`, date pickers) — use **`Controller`**/`useController` (<…/register.mdx>).
- **`Controller`** props: `name` (required), `control`, `render` (required), `rules`, `defaultValue`.
  `render` gets `{ field: { onChange, onBlur, value, disabled, name, ref }, fieldState: { invalid,
isTouched, isDirty, error }, formState }` — wire `field.value` + `field.onChange` to the controlled
  component (e.g. Radix `Select`'s `value`/`onValueChange`). Never double-register a Controller field;
  never `onChange(undefined)` (use `null`/`""`) (<…/controller.mdx>).

## handleSubmit (onValid / onInvalid)

- `handleSubmit(onValid, onInvalid?)`: `onValid(data, e?)` gets validated data; `onInvalid(errors, e?)`
  gets `formState.errors`. Async handlers are first-class; `formState.isSubmitting` is `true` for the
  duration of an async `onValid` — bind it to disable the submit button. Surface server-side failures
  via `setError` rather than throwing. Usage: `onSubmit={handleSubmit(onValid)}` (<…/handlesubmit.mdx>).

## formState (errors, isSubmitting, isDirty, isValid)

- Properties: `isDirty`, `dirtyFields`, `touchedFields`, `defaultValues`, `isSubmitted`,
  `isSubmitSuccessful`, `isSubmitting`, `isLoading`, `isValidating`, `submitCount`, `isValid`,
  `errors`, `isReady` (<…/formstate.mdx>).
  - `isDirty` requires **every input to have a defaultValue** for accurate comparison.
  - `isValid` needs a `mode` that validates before submit; `setError` does **not** flip it.
- **Proxy rule (load-bearing):** `formState` is a Proxy — read/destructure the exact fields you need
  **before render** to subscribe (`const { errors, isSubmitting } = formState;`). For `useEffect`, put
  the **whole** `formState` in the dependency array, not individual sub-fields (<…/formstate.mdx>).

## zodResolver (resolvers v4.1.3)

- Import `import { zodResolver } from "@hookform/resolvers/zod"` and `import { z } from "zod"`, then
  `useForm({ resolver: zodResolver(schema) })`; zod errors auto-populate `formState.errors`
  (<…/resolvers/v4.1.3/README.md>).
- **Transformed values:** RHF core supports `useForm<z.input<S>, unknown, z.output<S>>(...)` to type
  raw input and parsed output separately (useful with `z.coerce.*`) — a core feature, works on this
  pin (<…/resolvers/master/README.md>, <…/resolvers/v4.1.3/README.md>).
- **Do not adopt on this pin:** the `import { z } from "zod/v4"` path (belongs to zod-v4 /
  resolvers-v5); stay on zod v3 with `import { z } from "zod"` (<…/resolvers/v4.1.3/README.md>).

## Server Actions / React 19 interop

- **No official RHF v7 guidance** exists for React 19 Server Actions or `useActionState`; the
  `useForm`/`Controller` docs don't mention them (<…/useform.mdx>).
- RHF's own `<Form action={...}>` component's `action` prop is a **URL string endpoint** (with
  `method`, `progressive`, `onSuccess`/`onError`) — it is **not** a React 19 Server Action function
  and doesn't integrate with `useActionState`. Don't treat `<Form action={...}>` as
  `<form action={serverAction}>` (<…/form.mdx>).
- Community-standard pattern (**not** in official docs — flagged): keep RHF client-side — validate
  with `handleSubmit(onValid)` via `zodResolver`, then in `onValid` call the Server Action directly,
  map server errors with `setError`, and drive the button with `isSubmitting`. **Re-validate the same
  zod schema inside the Server Action** — client validation is not a trust boundary.
