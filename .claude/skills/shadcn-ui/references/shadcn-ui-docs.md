# shadcn/ui — docs digest

**Pinned to:** shadcn/ui in **new-york** style, **CSS variables**, **Tailwind v4**, **RSC**. Supporting
deps (from the repo `package.json`): `radix-ui ^1.6.2`, `@radix-ui/react-slot ^1.1.2`,
`class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `tailwind-merge ^3.0.1`, `lucide-react ^0.469.0`,
`next-themes ^0.4.4`, `tw-animate-css ^1.2.4`. Refresh if any of these bump a major.

**Researched on:** 2026-07-16. A distillation of the CURRENT shadcn/ui docs — a summary with
citations, not a copy of the docs.

> **Pinning caveat:** the live shadcn docs have begun migrating to **Base UI**. The button page now
> shows Base UI idioms (`<Button render={<a />} nativeButton={false} />`, `data-icon`, an
> always-applied `role="button"`), and the CLI gained a `--base <base|radix>` selector, a
> `registries` map, and new base-color names (`mauve`, `olive`, …). **This repo is on Radix**
> (`radix-ui` / `@radix-ui/react-slot`) — use the **`asChild` + Slot** pattern, classic neutral
> base colors, and plain `init`/`add`. Do **not** adopt the Base UI idioms on this pin.

**Official sources:**

- <https://ui.shadcn.com/docs/installation>
- <https://ui.shadcn.com/docs/installation/next>
- <https://ui.shadcn.com/docs/components-json>
- <https://ui.shadcn.com/docs/cli>
- <https://ui.shadcn.com/docs/theming>
- <https://ui.shadcn.com/docs/tailwind-v4>
- <https://ui.shadcn.com/docs/dark-mode/next>
- <https://ui.shadcn.com/docs/components/button>
- <https://ui.shadcn.com/r/styles/new-york-v4/button.json>
- <https://cva.style/docs/getting-started/variants>
- <https://github.com/joe-bell/cva>
- <https://github.com/dcastil/tailwind-merge>

---

## What shadcn/ui is

- Not an installed component library — components are **copied into your repo as owned code** built on
  Radix primitives, styled with Tailwind + `cva`, composed with `cn()`, and made polymorphic via
  `asChild`/Slot. You edit them directly (<https://ui.shadcn.com/r/styles/new-york-v4/button.json>).
- `components.json` is only needed if you use the CLI to add components
  (<https://ui.shadcn.com/docs/components-json>).

## components.json

- Shape: `$schema`, `style`, `rsc`, `tsx`, a `tailwind` object (`config`, `css`, `baseColor`,
  `cssVariables`, `prefix`), an `aliases` object (`components`, `ui`, `lib`, `hooks`, `utils`), and
  `iconLibrary` (<https://ui.shadcn.com/docs/components-json>).
- **`style: "new-york"`** is current; the old `default` style is **deprecated** — "Use the `new-york`
  style instead" (<https://ui.shadcn.com/docs/components-json>).
- **`tailwind.config: ""`** (empty) for Tailwind v4 — there is no `tailwind.config.js`.
  `cssVariables: true` selects semantic-token theming; `baseColor` (`neutral` here) is set at init and
  **cannot be changed afterward** (<https://ui.shadcn.com/docs/components-json>).
- `rsc: true` makes the CLI add `"use client"` only where needed; `tsx: true` selects TypeScript
  (<https://ui.shadcn.com/docs/components-json>).

## CLI

- Package is **`shadcn@latest`** (the old `shadcn-ui` package is deprecated). Init:
  `pnpm dlx shadcn@latest init`; add: `pnpm dlx shadcn@latest add button`
  (<https://ui.shadcn.com/docs/cli>, <https://ui.shadcn.com/docs/installation/next>).
- `add` flags: `-y/--yes`, `-o/--overwrite`, `-a/--all`, `-p/--path`, `--dry-run`
  (<https://ui.shadcn.com/docs/cli>).
- **Do not adopt on this pin:** the newer `--base`, `--monorepo`, `--rtl`, `registries`, and the
  `view`/`search`/`migrate` subcommands are Base-UI-era CLI surface (<https://ui.shadcn.com/docs/cli>).

## Theming (Tailwind v4 + CSS variables)

- Theming is done with **semantic CSS variables**, not per-component utility edits — background/
  foreground pairs where the surface token drops the suffix: `background`/`foreground`,
  `card`/`card-foreground`, `primary`/`primary-foreground`, plus structural `border`, `input`,
  `ring`, `destructive`, and the `sidebar-*` set (<https://ui.shadcn.com/docs/theming>).
- Light values in `:root`, dark overrides in `.dark` under the same names; colors authored in
  **oklch**; a single `--radius` derives `--radius-sm/md/lg` (<https://ui.shadcn.com/docs/theming>).
- Tailwind v4 wiring exposes the raw vars via **`@theme inline`** as `--color-*` (e.g.
  `--color-background: var(--background)`) so `bg-background`/`text-foreground` resolve. v4 baseline:
  `@import "tailwindcss"`, no config file, components carry **`data-slot`** attributes, **`forwardRef`
  removed** (plain function components), `size-*` replaces `w-*`+`h-*`, and **`tw-animate-css`**
  replaces the deprecated `tailwindcss-animate` (<https://ui.shadcn.com/docs/tailwind-v4>).

## Dark mode (next-themes, App Router)

- A `"use client"` `ThemeProvider` typed with `React.ComponentProps<typeof NextThemesProvider>` that
  spreads into `NextThemesProvider`; in the root layout put `suppressHydrationWarning` on `<html>` and
  wrap children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem
disableTransitionOnChange>`. **`attribute="class"`** is what drives the `.dark` selector
  (<https://ui.shadcn.com/docs/dark-mode/next>).

## Component / cva / cn model

- Verified button source (new-york-v4 registry): imports **`Slot` from `radix-ui`** (the unified
  package), `cva`+`VariantProps` from `class-variance-authority`, and `cn`. It defines
  `buttonVariants` with `variants: { variant, size }` + `defaultVariants`, renders `data-slot="button"`,
  and renders **`Slot.Root`** instead of `<button>` when `asChild` is true
  (<https://ui.shadcn.com/r/styles/new-york-v4/button.json>).
- Standard prop type: `React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
asChild?: boolean }`; `buttonVariants` is exported so a `<Link>`/`<a>` can borrow the style via
  `className={cn(buttonVariants({ variant, size }))}` (<https://ui.shadcn.com/docs/components/button>).
- **cva** API: `cva(base, { variants, compoundVariants, defaultVariants })`; call the result to get a
  class string; `VariantProps<typeof x>` derives the variant prop types. `class-variance-authority`
  latest is **v0.7.1** — exactly the repo pin (<https://cva.style/docs/getting-started/variants>,
  <https://github.com/joe-bell/cva>).
- **`import { Slot } from "@radix-ui/react-slot"`** (direct) and **`import { Slot } from "radix-ui"`**
  (namespaced, `Slot.Root`) both work; **match whichever a given component file already uses**
  (<https://ui.shadcn.com/r/styles/new-york-v4/button.json>).

## tailwind-merge & cn

- `twMerge` resolves conflicting Tailwind classes **last-one-wins**, dropping duplicates — which is why
  `cn()` is `twMerge(clsx(...))`: `clsx` assembles conditional classes, `twMerge` de-conflicts so a
  caller's `className` overrides the component default (<https://github.com/dcastil/tailwind-merge>).
- **tailwind-merge v3.x** is the Tailwind-v4-compatible line (v2.x targets Tailwind v3), so the
  `^3.0.1` pin is correct; bump freely **within** `^3` (<https://github.com/dcastil/tailwind-merge>).
