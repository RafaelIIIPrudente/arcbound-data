---
name: vitest-testing-library
description: Use when writing or reviewing unit/component tests in this repo — enforces Vitest + Testing Library idioms (jsdom/globals config, role-based queries, user-event setup, jest-dom matchers) and this repo's coverage-ratchet and ui-excluded conventions; keeps us aligned with current Vitest/RTL docs.
---

# Vitest + Testing Library (stack alignment)

Keep this repo's unit and component tests aligned with **Vitest 3 + Testing Library 16**. The
distilled, cited docs live in
[`references/vitest-testing-library-docs.md`](references/vitest-testing-library-docs.md); the wiring is
in [`vitest.config.ts`](../../../vitest.config.ts) and [`vitest.setup.ts`](../../../vitest.setup.ts).
The gate is `pnpm test` (`test:coverage` in CI). End-to-end tests are the
[`playwright`](../playwright/SKILL.md) skill's job. TDD is the `test-driven-development` skill.

## When to use

- Writing/reviewing a `*.test.ts(x)` for real logic (`src/lib`, `src/services`) or a component.
- Touching `vitest.config.ts` / `vitest.setup.ts` (environment, coverage thresholds, excludes).
- Any time a test asserts on implementation detail or reaches for a test-id where a role query works.

## Pinned version

From `package.json`: `vitest ^3.0.5`, `@vitest/coverage-v8 ^3.2.7`, `@testing-library/react ^16.2.0`,
`@testing-library/jest-dom ^6.6.3`, `@testing-library/user-event ^14.6.1`, `jsdom ^26.0.0`. **Aligned
to Vitest 3 — refresh if the major bumps.** vitest.dev now defaults to **v4** — cross-check config
against the v3 docs and don't adopt v4-only idioms on this pin.

## Current idioms (Vitest 3 / RTL 16)

Sourced + cited in
[`references/vitest-testing-library-docs.md`](references/vitest-testing-library-docs.md):

- **`environment: 'jsdom'` + `globals: true`** — `describe/it/expect/vi` are ambient, and globals give
  RTL **auto-cleanup**. jest-dom is wired in `setupFiles`.
- **Query by role first** — `screen.getByRole(role, { name: /…/i })`; `getByTestId` is the last resort.
  `queryBy*` for absence, `findBy*` for async appearance.
- **`userEvent.setup()` before `render`**, then `await user.click(...)` — interactions are async.
- **jest-dom matchers** (`toBeInTheDocument`, …) via `import "@testing-library/jest-dom/vitest"`.
- **Coverage v8** with thresholds; exclude untested-by-design code so it doesn't drag the ratchet.
- **Test behavior, not implementation** — "the more your tests resemble the way your software is used,
  the more confidence they can give you."

## This repo's conventions

- **`vitest.config.ts`** — `plugins: [react()]`, `environment: "jsdom"`, `globals: true`,
  `setupFiles: ["./vitest.setup.ts"]`, `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, and the `@` →
  `src` alias. Coverage: **provider `v8`**, `include: src/**`, and **`exclude`** covering
  `src/components/ui/**` (vendored shadcn), `src/lib/supabase/database.types.ts` (generated),
  `**/*.d.ts`, `**/*.config.*`, `e2e/**`.
- **Coverage is a ratchet** — global thresholds sit **just below** the measured baseline, with tighter
  per-path floors for `src/lib/**` and `src/services/**`. Don't lower them; adding real logic + tests
  should keep them satisfied. UI/app components are untested **by design** (hence the global floor is
  low and `ui/**` is excluded).
- **`vitest.setup.ts`** — the single line `import "@testing-library/jest-dom/vitest"`. Add global test
  wiring here, not per-file.
- **Existing tests are the models** — pure logic: `src/services/customers.test.ts`, `src/env.test.ts`,
  `src/config.test.ts`, `src/lib/{csp,seo,route-access}.test.ts` (small `describe`/`it`/`expect`);
  components: `src/components/error-state.test.tsx`,
  `src/components/dashboard/layout/side-nav.test.tsx`,
  `src/components/dashboard/customer/customers-table.test.tsx`.
- **`noUncheckedIndexedAccess` shows in tests** — e.g. `customers.test.ts` does `const first =
all.items[0]; expect(first).toBeDefined();` then `first!.name` — guard indexed access (see the
  `typescript-strict` skill).

## Banned / outdated

- **Don't assert implementation detail** or query by DOM structure/test-id where a role/label/text
  query works — brittle and low-confidence.
- **Don't lower coverage thresholds** to make CI pass — add tests, or exclude only genuinely
  untested-by-design code (with a reason), matching the existing excludes.
- **Don't write brittle presentational tests for `ui/**`** — it's excluded/untested by design; test
  `src/lib` and `src/services` logic (RED-first — see `test-driven-development`).
- **Don't adopt on this pin** — the RTL `legacyRoot` option (React 19 removed `ReactDOM.render`) or
  Vitest v4-only config idioms.
- **Don't forget `await`** on `userEvent` interactions and `findBy*` queries.

## Common tasks

- **Test a pure function/service:** `import { describe, it, expect }` (or rely on globals), RED-first,
  assert observable behavior. Copy `src/services/customers.test.ts`.
- **Test a component:** `render(<C … />)`, query with `screen.getByRole(...)`, interact with
  `userEvent.setup()` + `await user.click(...)`, assert with jest-dom matchers.
- **Guard indexed access:** `const x = arr[0]; expect(x).toBeDefined();` then use `x!`/narrow.
- **Exclude generated/vendored code** from coverage: add a glob to `coverage.exclude` with a comment
  saying why.

## Refresh

1. Re-run **`/research`** against vitest.dev (config, coverage, api, mocking — use the **v3** docs) and
   testing-library.com (react intro/api, queries/about, guiding-principles, user-event, jest-dom) —
   **pin to Vitest 3 / RTL 16**.
2. Update [`references/vitest-testing-library-docs.md`](references/vitest-testing-library-docs.md) —
   digest, **Official sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when Vitest changes major** (3 → 4) — re-verify config keys and keep
   `@vitest/coverage-v8` on the same major as `vitest`.
