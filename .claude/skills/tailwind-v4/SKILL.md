---
name: tailwind-v4
description: Use when writing or reviewing Tailwind CSS in this repo — enforces Tailwind v4 CSS-first idioms and this repo's token conventions; keeps us aligned with current Tailwind v4 docs.
---

# Tailwind v4 (stack alignment)

Keep this repo's styling aligned with **current Tailwind CSS v4** — the CSS-first
model — and with this repo's token conventions. The distilled, cited docs live in
[`references/tailwind-v4-docs.md`](references/tailwind-v4-docs.md); the wiring is in
[`src/app/globals.css`](../../../src/app/globals.css).

## When to use

- Editing or adding styles / utility classes on any component.
- Adding or adjusting a **design token** (a color, radius, font, spacing).
- Reviewing a diff that touches classes, `globals.css`, `postcss.config.mjs`, or `components.json`.
- Anything dark-mode related, or when tempted to reach for a v3 idiom (`tailwind.config.js`, `@tailwind` directives).

## Pinned version

From `package.json`: `tailwindcss ^4.0.0`, `@tailwindcss/postcss ^4.0.0`,
`prettier-plugin-tailwindcss ^0.6.11`, `tw-animate-css ^1.2.4`. **Aligned to
Tailwind v4.x — refresh if the major bumps** (see the Refresh section).

## Current idioms (v4)

The modern, correct way (sourced + cited in
[`references/tailwind-v4-docs.md`](references/tailwind-v4-docs.md)):

- **One entry import:** `@import "tailwindcss";` — never the v3
  `@tailwind base/components/utilities` directives.
- **CSS-first config:** design tokens live in `@theme { … }` (or `@theme inline`
  when a token references another CSS var). No `tailwind.config.js`.
- **`@theme` vs `:root`:** a var in `@theme` generates utilities (a token); a var in
  `:root` is a runtime variable with no utility.
- **Custom variants in CSS:** `@custom-variant dark (…)`; custom utilities via
  `@utility`, not `@layer utilities`.
- **Colors are oklch**, consumed as semantic utilities and `var(--color-*)`; opacity
  via the slash modifier (`bg-primary/50`); CSS-var shorthand uses **parentheses**
  (`bg-(--brand)`, not `bg-[--brand]`).
- **PostCSS plugin is `@tailwindcss/postcss`** (autoprefixer/postcss-import are built
  in); content is auto-detected (no `content` array).
- **Container queries are built in** (`@container`, `@sm:`) — no plugin.
- **v3→v4 deltas** to watch: default border color is now `currentColor`, `ring` is
  1px, several scale utilities were renamed (`shadow-sm→shadow-xs`, etc.), and
  `bg-opacity-*` → `/opacity`. Full list in the references digest.

## This repo's conventions

Anchor to the real files — `src/app/globals.css` is the source of truth for how
tokens are wired here:

- **`src/app/globals.css`** — `@import "tailwindcss";` then `@import "tw-animate-css";`;
  `@custom-variant dark (&:is(.dark *))`; semantic tokens in `:root` and `.dark`
  authored in **oklch** (with the brand accent pinned as an exact hex —
  `--primary: #f63a3a`, `--ring: #f63a3a`); an **`@theme inline`** block mapping
  `--color-*: var(--…)` and the fonts (`--font-sans: var(--font-geist)`,
  `--font-mono: var(--font-geist-mono)`, `--font-display: var(--font-inter-tight)`) —
  `inline` is correct because each value references another CSS var; and a base layer
  (`@layer base` applying `border-border` and `bg-background text-foreground`).
- **`postcss.config.mjs`** — only `@tailwindcss/postcss`. Nothing else.
- **`components.json`** — shadcn `new-york`, `cssVariables: true`, `config: ""` (no JS
  config), `baseColor: neutral`.
- **`src/lib/utils.ts`** — compose classes with **`cn()`** (`twMerge(clsx(...))`).
- **`AGENTS.md`** — shadcn/ui + Tailwind only, **no other UI kit**; routes/links go
  through `src/paths.ts`.

**Canonical way to style:** semantic token utilities — `bg-primary`,
`text-foreground`, `border-border`, `rounded-lg`, `text-muted-foreground` — not raw
colors. New tokens are added in `globals.css` (a `:root`/`.dark` var + its
`@theme inline` `--color-*` mapping), then used via the generated utility.

**Design brief is visual reference only:** the design brief's `--bg` / `--fg` /
`--accent` variable names are a mockup vocabulary — **never introduce them into the
app**. The app's token names are the shadcn semantic set (`--background`,
`--foreground`, `--primary`, …).

**Doc↔repo note:** the current docs show the dark variant as
`@custom-variant dark (&:where(.dark, .dark *))` (zero specificity); this repo uses
the equivalent `&:is(.dark *)`. Follow the repo's actual wiring — `globals.css` wins.

## Banned / outdated

- **No `tailwind.config.js`** — v3 pattern; config is CSS-first (`@theme`).
- **No `@tailwind base/components/utilities`** — use `@import "tailwindcss";`.
- **No ad-hoc hex / spacing where a token exists** — use the semantic utility.
  _Carve-out:_ `src/app/icon.tsx`, `src/app/apple-icon.tsx`,
  `src/app/opengraph-image.tsx`, and `src/app/manifest.ts` legitimately use raw hex
  (Satori/`next/og` image generation and the PWA manifest — outside Tailwind).
- **No competing UI kit** (MUI/Chakra/etc.) — shadcn/ui + Tailwind only.
- **Don't hand-sort class names** — `prettier-plugin-tailwindcss` owns class order.

## Common tasks

- **Add / adjust a design token:** in `globals.css`, add the var to `:root` (and its
  dark value to `.dark`), then map it under `@theme inline` as `--color-<name>:
var(--<name>)`. Use it as `bg-<name>` / `text-<name>`. Don't hard-code the value in
  components.
- **Style a component with tokens + `cn()`:** `className={cn("rounded-lg border
bg-card p-4 text-card-foreground", isActive && "ring-2 ring-ring")}`.
- **Dark mode:** author light values in `:root`, dark overrides in `.dark`; the
  `.dark` class is toggled on `<html>` by the theme provider — write pairs like
  `bg-background text-foreground` and they adapt automatically. Reach for explicit
  `dark:` utilities only for one-off overrides.
- **Class ordering:** just run the formatter (`pnpm format`) — never reorder by hand.

## Refresh

To re-align when Tailwind moves:

1. Re-run **`/research`** against the official docs (installation, theme,
   functions-and-directives, dark-mode, colors, responsive-design, upgrade-guide, and
   the v4 announcement).
2. Update [`references/tailwind-v4-docs.md`](references/tailwind-v4-docs.md) — the
   digest, the **Official sources** URLs, and the **Researched on** date.
3. Update the [Pinned version](#pinned-version) block from `package.json`.
4. **Bump this skill when Tailwind changes major** (e.g. v4 → v5): re-verify every
   idiom above against the new docs and note the deltas.
