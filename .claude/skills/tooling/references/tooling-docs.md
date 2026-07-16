# Tooling (ESLint · Prettier · commitlint · husky · lint-staged) — docs digest

**Pinned to:** `eslint ^9.23.0` (flat config + `eslint-config-next`), `prettier ^3.5.3` (+
`prettier-plugin-tailwindcss ^0.6.11`), `@commitlint/cli ^19.8.0` + `@commitlint/config-conventional`,
`husky ^9.1.7`, `lint-staged ^15.4.3` (see the repo `package.json`). Refresh if any bumps a major.

**Researched on:** 2026-07-16. A distillation of the CURRENT tooling model, pinned to the versions
above — a summary with citations, not a copy of the docs.

> **Pinning caveat:** the two newer-only idioms flagged **do not adopt on this pin** are (1) the Next 16
> ESLint style — direct `eslint-config-next/core-web-vitals` import + `defineConfig`/`globalIgnores` +
> `eslint-config-prettier/flat` (this repo is Next 15 → use `FlatCompat`; `next lint` still exists on
> 15 but was removed in Next 16) — and (2) the legacy husky v8 `husky.sh` hook preamble (v9 hooks are
> preamble-free).

**Official sources:**

- <https://eslint.org/docs/latest/use/configure/configuration-files>
- <https://eslint.org/docs/latest/use/configure/migration-guide>
- <https://prettier.io/docs/configuration>
- <https://github.com/tailwindlabs/prettier-plugin-tailwindcss>
- <https://commitlint.js.org/reference/configuration.html>
- <https://www.conventionalcommits.org/en/v1.0.0/>
- <https://typicode.github.io/husky/>
- <https://typicode.github.io/husky/get-started.html>
- <https://github.com/lint-staged/lint-staged>
- <https://nextjs.org/docs/app/api-reference/config/eslint>

---

## ESLint flat config + Next interop

- Flat config lives in `eslint.config.js`/`.mjs`/`.cjs` at the root and **exports an array of config
  objects** — replacing `.eslintrc`. Keys per object: `files`, `ignores`, `plugins` (name→object map),
  `rules`, `languageOptions`, `settings` (<https://eslint.org/docs/latest/use/configure/configuration-files>).
- A **global-ignores** object has `ignores` and no other keys (replaces `.eslintignore`); dotfiles are
  no longer ignored by default. **ESLint v9 made flat config the default** — no `ESLINT_USE_FLAT_CONFIG`
  flag needed (<https://eslint.org/docs/latest/use/configure/migration-guide>).
- **Next 15 interop = `FlatCompat`.** `eslint-config-next` ships as an eslintrc-style config on Next
  15, bridged with `FlatCompat` from `@eslint/eslintrc`: `const compat = new FlatCompat({ baseDirectory:
__dirname }); export default [...compat.extends("next/core-web-vitals", "next/typescript")]`
  (<https://eslint.org/docs/latest/use/configure/migration-guide>). `create-next-app` scaffolds exactly
  this on Next 15.
- **Do not adopt on this pin (Next 16):** direct `import nextVitals from "eslint-config-next/core-web-vitals"`,
  `defineConfig`/`globalIgnores` from `eslint/config`, and `eslint-config-prettier/flat` — those assume
  Next 16's native-flat-config package; and `next lint` was **removed in Next 16**. On Next 15 keep
  `FlatCompat` (<https://nextjs.org/docs/app/api-reference/config/eslint>).

## Prettier + tailwindcss plugin

- Config resolution (first match wins): `prettier` key in `package.json` → `.prettierrc(.json/.yaml)` →
  JS/TS → ESM/CJS → `.prettierrc.toml`. Prettier has **no global config** — keep it project-level.
  Common options: `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth`
  (<https://prettier.io/docs/configuration>).
- **`prettier-plugin-tailwindcss`** auto-sorts Tailwind classes (needs Prettier v3+); register it in
  `plugins`. It is **incompatible with other plugins using the same APIs, so it must be listed last**.
  For Tailwind v4 point **`tailwindStylesheet`** at the CSS entry (`tailwindConfig` is the v3 path)
  (<https://github.com/tailwindlabs/prettier-plugin-tailwindcss>).

## commitlint + Conventional Commits

- Config via cosmiconfig (`commitlint.config.{js,ts,mjs,…}`, `.commitlintrc*`, or a `package.json`
  field). Minimal idiom: `export default { extends: ["@commitlint/config-conventional"] }`
  (<https://commitlint.js.org/reference/configuration.html>).
- Rules are `[level, applicability, value]` — level `0` off / `1` warn / `2` error; applicability
  `"always"`/`"never"`. Extending `config-conventional` switches the parser to the Conventional Commits
  preset (<https://commitlint.js.org/reference/configuration.html>).
- **Message shape:** `<type>[optional scope]: <description>` + optional body/footer. Types: **`feat`**
  (MINOR) and **`fix`** (PATCH) are primary; `build`, `chore`, `ci`, `docs`, `style`, `refactor`,
  `perf`, `test` are the common additional types. Breaking change = a `!` after type/scope or a
  `BREAKING CHANGE:` footer (MAJOR) (<https://www.conventionalcommits.org/en/v1.0.0/>).

## Husky v9

- v9 uses Git's `core.hooksPath` + a `.husky/` directory of individual hook files (fast, zero-dep).
  Setup: `pnpm add -D husky` then `pnpm exec husky init` — which creates `.husky/pre-commit` and adds a
  `prepare` script (auto-installs hooks on `install`)
  (<https://typicode.github.io/husky/get-started.html>).
- **Preamble-free format:** v9 hook files are plain scripts — the old v8 preamble (a
  `#!/usr/bin/env sh` shebang plus the `. "$(dirname -- "$0")/_/husky.sh"` sourcing line) is
  **deprecated and no longer required**. A hook file should just contain the command(s), e.g.
  `pnpm lint-staged`. **Do not adopt** the legacy `husky.sh` sourcing on this pin
  (<https://typicode.github.io/husky/>).

## lint-staged

- Runs commands against **only git-staged files**. Config via `lint-staged` key, `.lintstagedrc*`, or
  `lint-staged.config.{js,mjs,cjs}`. Shape maps glob → command (or an array run sequentially), e.g.
  `{ "*.{ts,tsx}": ["eslint --fix", "prettier --write"] }`
  (<https://github.com/lint-staged/lint-staged>).
- **Auto re-staging (load-bearing):** lint-staged **automatically re-stages any modifications the
  commands make** (e.g. Prettier/ESLint `--fix` reformatting, Tailwind class reordering) into the
  commit, as long as tasks exit cleanly — no manual `git add` needed. Partially-staged files: unstaged
  changes are stashed/restored around tasks by default. Wire it from Husky's pre-commit hook
  (`pnpm lint-staged`) (<https://github.com/lint-staged/lint-staged>).
