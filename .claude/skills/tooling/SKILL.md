---
name: tooling
description: Use when touching ESLint, Prettier, commitlint, husky, or lint-staged in this repo — enforces the current idioms (ESLint flat config via FlatCompat, Prettier + tailwind plugin, Conventional Commits, preamble-free husky v9, lint-staged auto-restage) and this repo's config; keeps us aligned with current tooling docs.
---

# Tooling (stack alignment)

Keep this repo's lint/format/commit chain aligned with **current ESLint 9 flat config, Prettier 3,
commitlint 19, husky 9, and lint-staged 15**. The distilled, cited docs live in
[`references/tooling-docs.md`](references/tooling-docs.md); the configs are
[`eslint.config.mjs`](../../../eslint.config.mjs), [`.prettierrc.json`](../../../.prettierrc.json),
[`commitlint.config.ts`](../../../commitlint.config.ts),
[`lint-staged.config.mjs`](../../../lint-staged.config.mjs), the [`.husky/`](../../../.husky) hooks, and
[`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml).

## When to use

- Editing any of the configs above, or adding/changing a lint rule, format option, or git hook.
- Writing a commit message (Conventional Commits are **enforced**) or diagnosing a hook failure.
- Reviewing a diff that hand-sorts Tailwind classes, adds an `.eslintrc`, or bypasses hooks.

## Pinned version

From `package.json`: `eslint ^9.23.0` + `eslint-config-next`, `prettier ^3.5.3` +
`prettier-plugin-tailwindcss ^0.6.11`, `@commitlint/cli ^19.8.0` + `config-conventional`, `husky
^9.1.7`, `lint-staged ^15.4.3`. **Aligned to these majors — refresh if any bumps.** Do **not** adopt
the Next 16 ESLint style or the husky v8 hook preamble on this pin (see Refresh).

## Current idioms

Sourced + cited in [`references/tooling-docs.md`](references/tooling-docs.md):

- **ESLint flat config** — `eslint.config.mjs` exporting an **array** of config objects; Next 15 is
  bridged with **`FlatCompat`** (`compat.extends("next/core-web-vitals", "next/typescript")`). No
  `.eslintrc`/`.eslintignore`.
- **Prettier** — project-level config; **`prettier-plugin-tailwindcss` must be listed last** and uses
  `tailwindStylesheet` (v4) to auto-sort classes.
- **Conventional Commits** (`<type>[scope]: <desc>`) enforced via `config-conventional` — `feat`/`fix`
  primary; `!`/`BREAKING CHANGE:` for majors.
- **Husky v9 preamble-free hooks** — `.husky/*` files contain just the command(s); no `husky.sh`
  sourcing.
- **lint-staged** runs on staged files and **auto re-stages** whatever the commands modify (formatting,
  class reordering).

## This repo's conventions

- **`eslint.config.mjs`** — `FlatCompat` bridging `next/core-web-vitals` + `next/typescript`, a global
  `ignores` block (`.next`, `coverage`, `playwright-report`, …), and one rule override
  (`@typescript-eslint/no-unused-vars: "off"`). Gate: `pnpm lint` (`next lint`).
- **`.prettierrc.json`** — `plugins: ["prettier-plugin-tailwindcss"]`, `tailwindStylesheet:
"./src/app/globals.css"`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `printWidth:
100`. `.prettierignore` covers build/lock/generated paths. Gate: `pnpm format`.
- **`commitlint.config.ts`** — `export default { extends: ["@commitlint/config-conventional"] }`;
  enforced by the **`commit-msg`** hook.
- **`lint-staged.config.mjs`** — `*.{ts,tsx}` → `["eslint --fix", "prettier --write"]`;
  `*.{js,mjs,cjs,json,css,md}` → `["prettier --write"]`.
- **`.husky/pre-commit`** runs **`pnpm lint-staged`** _and_ **`pnpm type:check`**; **`.husky/commit-msg`**
  runs `commitlint --edit`. Both are preamble-free v9 hooks.
- **`.github/workflows/ci.yml`** — the `verify` job: `lint` → `type:check` → `test:coverage` →
  Playwright install → `test:e2e` → `build`, plus a PR-only `dependency-review`. **pnpm comes from the
  `packageManager` field** — do **not** add a `version:` input to `pnpm/action-setup` (it errors on the
  mismatch; there's a comment in the file about it).

## Banned / outdated

- **Pre-commit auto-formats and re-stages** (eslint `--fix` + prettier + Tailwind class reorder) into
  the same commit — so **don't hand-sort Tailwind classes** and **don't fight the formatter**; let the
  hook own class order. Don't bypass hooks (`--no-verify`) to dodge it.
- **Commits must be Conventional** — the `commit-msg` hook rejects non-conforming subjects (a real
  failure earlier in this project was a `type`/`subject`-empty message).
- **No `.eslintrc`/`.eslintignore`** — flat config only.
- **`prettier-plugin-tailwindcss` stays last** in the `plugins` array.
- **Don't adopt on this pin** — the Next 16 ESLint style (direct `eslint-config-next/core-web-vitals`
  import, `defineConfig`/`globalIgnores`, `eslint-config-prettier/flat`; `next lint` is removed in Next 16) or the husky v8 `husky.sh` hook preamble.
- **Don't re-add a pnpm `version:` input** to the CI action — the `packageManager` field is the single
  source.

## Common tasks

- **Write a commit:** `type(scope): subject` — e.g. `feat(clients): add add-client flow`,
  `fix(auth): keep public metadata routes ungated`, `docs: …`. Breaking → `feat!: …`.
- **Add a lint ignore/rule:** edit the flat-config array in `eslint.config.mjs` (a global `ignores`
  object, or a `{ rules }` object) — never an `.eslintrc`.
- **Change a format option:** edit `.prettierrc.json` (keep the tailwind plugin last) and run `pnpm
format`.
- **Add a pre-commit task:** add a glob→command entry to `lint-staged.config.mjs` (it'll auto-restage);
  keep `type:check` in the hook.

## Refresh

1. Re-run **`/research`** against eslint.org (configuration-files, migration-guide), prettier.io +
   the prettier-plugin-tailwindcss README, commitlint.js.org + conventionalcommits.org,
   typicode.github.io/husky, and the lint-staged README — flag any newer-major idioms.
2. Update [`references/tooling-docs.md`](references/tooling-docs.md) — digest, **Official sources**,
   and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Reassess the ESLint config when this repo moves to Next 16** — that's when the `FlatCompat` bridge
   gives way to the direct `eslint-config-next/*` flat imports and `next lint` disappears; adopt
   deliberately.
