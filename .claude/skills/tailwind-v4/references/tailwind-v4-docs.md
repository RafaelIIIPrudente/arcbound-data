# Tailwind CSS v4 — docs digest

**Pinned to:** Tailwind v4.x — `tailwindcss ^4.0.0`, `@tailwindcss/postcss ^4.0.0`,
`prettier-plugin-tailwindcss ^0.6.11`, `tw-animate-css ^1.2.4` (see the repo
`package.json`). Refresh if the major bumps.

**Researched on:** 2026-07-16 (v4.0 shipped 2025-01-22; digest reflects the current
4.x line). This is a distillation of the CURRENT v4 CSS-first model — not v3 — for
alignment. It is a summary with citations, not a copy of the docs.

**Official sources:**

- <https://tailwindcss.com/docs/installation/using-postcss>
- <https://tailwindcss.com/blog/tailwindcss-v4>
- <https://tailwindcss.com/docs/theme>
- <https://tailwindcss.com/docs/functions-and-directives>
- <https://tailwindcss.com/docs/dark-mode>
- <https://tailwindcss.com/docs/colors>
- <https://tailwindcss.com/docs/responsive-design>
- <https://tailwindcss.com/docs/upgrade-guide>

---

## Install & entry point

- The PostCSS plugin is a **separate package**, `@tailwindcss/postcss`; the
  `tailwindcss` package is no longer itself a PostCSS plugin. Configure it as the
  only plugin: `export default { plugins: { "@tailwindcss/postcss": {} } }`
  (<https://tailwindcss.com/docs/installation/using-postcss>).
- The CSS entry point is a **single `@import "tailwindcss";`**, replacing v3's three
  `@tailwind base/components/utilities` directives
  (<https://tailwindcss.com/docs/installation/using-postcss>,
  <https://tailwindcss.com/blog/tailwindcss-v4>).
- `@tailwindcss/postcss` inlines `@import` and adds vendor prefixes automatically —
  **no `postcss-import` or `autoprefixer`** (<https://tailwindcss.com/docs/upgrade-guide>).
- **Automatic content detection**: no `content` array. Tailwind scans templates by
  default, respects `.gitignore`, skips binaries; add extra sources with
  `@source "…"` (<https://tailwindcss.com/blog/tailwindcss-v4>).

## Theme / `@theme`

- Design tokens are CSS custom properties declared in the **`@theme`** directive.
  A `@theme` var is more than a CSS var — it also tells Tailwind to **generate the
  matching utilities**. `@theme { --color-mint-500: oklch(0.72 0.11 178) }` yields
  `bg-mint-500`, `text-mint-500`, `border-mint-500`, … plus `var(--color-mint-500)`
  (<https://tailwindcss.com/docs/theme>).
- **Namespaces → utility families** (<https://tailwindcss.com/docs/theme>):
  `--color-*` → color utilities; `--font-*` → `font-sans/serif/mono`; `--text-*` →
  `text-xl` font-size; `--font-weight-*`, `--tracking-*`, `--leading-*`;
  `--radius-*` → `rounded-*`; `--shadow-*`, `--blur-*`, `--ease-*`, `--animate-*`;
  `--spacing` / `--spacing-*` → all spacing & sizing (`p-*`, `m-*`, `w-*`, `gap-*`);
  `--breakpoint-*` → `sm:`/`md:`…; `--container-*` → `@sm:` container sizes + `max-w-*`.
- **`@theme inline { … }`** — use when a token's value **references another CSS
  variable** (e.g. `--font-sans: var(--font-geist)`, or a semantic token that maps to
  a `:root`/`.dark` var). `inline` embeds the resolved value into the generated
  utility; without it the utility points back at the theme variable and can resolve
  to a fallback depending on where the referenced var is defined
  (<https://tailwindcss.com/docs/theme>, <https://tailwindcss.com/docs/colors>).
- **`@theme` vs plain `:root`**: put a var in `@theme` when it should generate a
  utility (a design token); put it in `:root` (or any selector) when you want a
  runtime CSS variable with **no** utility. All `@theme` values are still emitted as
  real CSS vars on `:root`, usable via `var(--…)` in custom CSS
  (<https://tailwindcss.com/docs/theme>).
- Extras: `@theme static {}` forces unused vars into output; reset a namespace with
  `--namespace-*: initial` (or `--*: initial` to wipe all defaults) before
  redefining (<https://tailwindcss.com/docs/theme>).

## Utilities & colors

- The default palette is authored in **oklch** (wider P3 gamut), e.g.
  `--color-blue-500: oklch(62.3% 0.214 259.815)`
  (<https://tailwindcss.com/docs/colors>, <https://tailwindcss.com/blog/tailwindcss-v4>).
- **22 color families**, each an 11-step 50→950 scale (red, orange, amber, yellow,
  lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia,
  pink, rose, slate, gray, zinc, neutral, stone) plus `black`/`white`
  (<https://tailwindcss.com/docs/colors>).
- **Opacity modifiers**: slash = alpha %, e.g. `bg-sky-500/10`, `text-blue-500/75`,
  `bg-pink-500/[71.37%]`, `bg-cyan-400/(--my-alpha)`
  (<https://tailwindcss.com/docs/colors>).
- **Arbitrary values** in square brackets: `grid-cols-[max-content_auto]`,
  `w-[50cqw]` (commas → underscores). **CSS-variable shorthand uses parentheses**
  now: `bg-(--brand)` (not v3's `bg-[--brand]`)
  (<https://tailwindcss.com/docs/responsive-design>,
  <https://tailwindcss.com/docs/upgrade-guide>).
- **Dynamic values**: spacing/grid utilities accept unconfigured values (e.g.
  `grid-cols-15`) because they derive from the single `--spacing` base + the dynamic
  engine (<https://tailwindcss.com/blog/tailwindcss-v4>).

## Variants / `@custom-variant`

- Register a variant in CSS: `@custom-variant name (<selector>)`
  (<https://tailwindcss.com/docs/functions-and-directives>). Example:
  `@custom-variant theme-midnight (&:where([data-theme="midnight"] *))`.
- Canonical **dark-mode override** (selector/class strategy). The current docs use a
  zero-specificity `:where(...)` form; the `:is(.dark *)` form is equivalent
  (<https://tailwindcss.com/docs/dark-mode>):
  ```css
  @custom-variant dark (&:where(.dark, .dark *));
  ```
- Apply a variant to a CSS block with `@variant`, e.g. `@variant dark { … }`
  (<https://tailwindcss.com/docs/functions-and-directives>).

## Directives & functions

Directives (<https://tailwindcss.com/docs/functions-and-directives>):

- **`@utility name { … }`** — the v4 way to add a custom utility that works with
  variants (`hover:`, `lg:`…); replaces v3's `@layer utilities`.
- **`@apply`** — inline existing utilities into custom CSS.
- **`@layer base|components`** — still used for base/component CSS; custom
  **utilities** move to `@utility`.
- **`@config "…"`** — load a legacy v3 JS config for compatibility (`corePlugins`,
  `safelist`, `separator` are unsupported in v4).
- **`@source "…"`** — add template sources outside auto-detection.
- **`@reference "…"`** — in scoped `<style>` blocks (Vue/Svelte/CSS Modules) so
  `@apply` sees theme vars without duplicating output.

Functions (<https://tailwindcss.com/docs/functions-and-directives>):

- **`--alpha(color / percent)`** → `color-mix(in oklab, color percent, transparent)`.
- **`--spacing(n)`** → `calc(var(--spacing) * n)`.
- The legacy **`theme`** function — v3's CSS dot-notation for reading theme values (e.g. a
  `spacing.12` path) — is **deprecated** in v4. With no JS theme config to resolve against,
  such paths also trip Tailwind IntelliSense's `invalidConfigPath` warning. Prefer CSS
  variables (`var(--spacing)` / `var(--color-*)`) or the matching `@theme` variable instead.

## Dark mode

- **Default strategy is `prefers-color-scheme`**: `dark:` tracks the OS setting with
  no config — `class="bg-white dark:bg-gray-800"`
  (<https://tailwindcss.com/docs/dark-mode>).
- **Manual (class/selector) strategy**: override the `dark` variant with
  `@custom-variant dark (…)`, then toggle `.dark` (or `data-theme="dark"`) on
  `<html>` — typically driven by a theme library
  (<https://tailwindcss.com/docs/dark-mode>).

## v3 → v4 deltas & gotchas

Migration is largely automated by `npx @tailwindcss/upgrade` (Node 20+)
(<https://tailwindcss.com/docs/upgrade-guide>). Manual watch-items:

- **No `tailwind.config.js` by default** — CSS-first via `@theme`; keep legacy JS
  config only via `@config "…"`.
- **Imports**: three `@tailwind` directives → one `@import "tailwindcss";`.
- **PostCSS plugin moved** to `@tailwindcss/postcss`; drop `autoprefixer` /
  `postcss-import` (built in).
- **Default border color** `gray-200` → **`currentColor`** (specify `border-gray-200`
  or restore in a base layer).
- **Default ring** `3px blue-500` → **`1px currentColor`**; use `ring-3` for the old
  look (or set `--default-ring-width` / `--default-ring-color`).
- **Renamed scales**: `shadow-sm→shadow-xs`, `shadow→shadow-sm`, `rounded-sm→rounded-xs`,
  `blur-sm→blur-xs`, `outline-none→outline-hidden`, `ring→ring-3`.
- **Removed legacy utilities**: `bg-opacity-*`/`text-opacity-*`/… → `/opacity` slash;
  `flex-shrink-*→shrink-*`, `flex-grow-*→grow-*`, `overflow-ellipsis→text-ellipsis`.
- **CSS-var arbitrary syntax**: `bg-[--brand]` → `bg-(--brand)`.
- **`!important` at the end**: `bg-red-500!` (not `!bg-red-500`).
- **Variant stacking is left-to-right**: `*:first:pt-0` (was `first:*:pt-0`).
- **`space-*` / `divide-*` selectors changed** for performance — prefer
  `flex`/`grid` + `gap`.
- **Container queries are built in** (no plugin): `@container` + `@sm:`/`@lg:`,
  `@max-*`, named containers (`@container/main` + `@sm/main:`); customize via
  `--container-*` (<https://tailwindcss.com/docs/responsive-design>,
  <https://tailwindcss.com/blog/tailwindcss-v4>).
- **Browser floor**: Safari 16.4+, Chrome 111+, Firefox 128+; no Sass/Less/Stylus —
  stay on v3.4 for older targets.
