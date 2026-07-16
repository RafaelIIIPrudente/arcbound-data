# Vitest + Testing Library — docs digest

**Pinned to:** `vitest ^3.0.5`, `@vitest/coverage-v8 ^3.2.7`, `@testing-library/react ^16.2.0`,
`@testing-library/jest-dom ^6.6.3`, `@testing-library/user-event ^14.6.1`, `jsdom ^26.0.0`,
`@vitejs/plugin-react` (see the repo `package.json`). Refresh if any bumps a major.

**Researched on:** 2026-07-16. A distillation of the CURRENT Vitest + Testing Library model, pinned to
the versions above — a summary with citations, not a copy of the docs.

> **Pinning caveat:** vitest.dev now serves **v4.1.x** by default; the config/coverage facts below are
> taken from the **version-locked v3 docs** so they're pin-accurate. Keep `@vitest/coverage-v8` in the
> **same major** as `vitest`. Idioms flagged **do not adopt on this pin** are v4-only.

**Official sources:**

- <https://v3.vitest.dev/config/>
- <https://v3.vitest.dev/guide/coverage>
- <https://vitest.dev/api/>
- <https://vitest.dev/guide/mocking>
- <https://testing-library.com/docs/react-testing-library/intro>
- <https://testing-library.com/docs/react-testing-library/api>
- <https://testing-library.com/docs/queries/about>
- <https://testing-library.com/docs/guiding-principles>
- <https://testing-library.com/docs/user-event/intro>
- <https://github.com/testing-library/jest-dom>

---

## Vitest config (v3)

- `test.environment`: default `'node'`; set **`'jsdom'`** for DOM tests (jsdom must be installed).
  Per-file override via `/** @vitest-environment jsdom */` (<https://v3.vitest.dev/config/>).
- `test.globals`: default `false`; **`true`** exposes `describe/it/test/expect/vi/beforeEach/…` without
  imports — add `"vitest/globals"` to `tsconfig` `types` for TS. Globals also enable **auto-cleanup**
  in RTL (a global `afterEach`) (<https://v3.vitest.dev/config/>).
- `test.setupFiles`: runs before each test file — where jest-dom is wired.
  `test.include`: default `['**/*.{test,spec}.?(c|m)[jt]s?(x)']`. Use `defineConfig` from
  `'vitest/config'` (<https://v3.vitest.dev/config/>).

## Coverage (v8, v3)

- Providers: **`v8` (default)** and `istanbul`; install `@vitest/coverage-v8` separately. Enable with
  `--coverage` or `coverage.enabled: true` (<https://v3.vitest.dev/guide/coverage>).
- **`coverage.thresholds`**: numeric `lines`/`functions`/`branches`/`statements`, plus `perFile` and
  `autoUpdate`, and **glob-keyed per-path thresholds** (<https://v3.vitest.dev/config/>).
- **`coverage.exclude`**: globs — put non-tested-by-design code (e.g. vendored shadcn `ui/**`,
  generated types) here so they don't count against thresholds (<https://v3.vitest.dev/config/>).
- The v8 provider gained **AST-aware remapping in 3.2.0** ("speed of V8, accuracy of Istanbul") — both
  pins reach it (<https://v3.vitest.dev/guide/coverage>).

## Vitest API + mocking (stable across v3/v4)

- `test`/`it` `(name, body?, timeout?)`, default timeout 5000ms; `describe` groups; modifiers
  `.skip/.only/.todo/.concurrent`. Lifecycle: `beforeEach/afterEach/beforeAll/afterAll`
  (<https://vitest.dev/api/>).
- `vi.fn()` + `.mockReturnValue()` / `.mockResolvedValue()` / `.mockImplementation()`.
  **`vi.mock(path, factory?)` is hoisted above imports** — reference outer vars only inside
  `vi.hoisted(...)`. `vi.spyOn(obj, 'method')` spies; `vi.mocked(x)` types a mock. Clear/reset mocks
  between tests (`vi.clearAllMocks` or `clearMocks: true`) (<https://vitest.dev/guide/mocking>).

## RTL render / queries / renderHook (v16)

- `render(ui, options?)` → `RenderResult` (`container`, `rerender`, `unmount`, `asFragment`); prefer
  **`screen.getByRole(...)`** over destructuring queries. `renderHook(cb, { initialProps, wrapper })` →
  `{ result.current, rerender, unmount }`. `cleanup` runs automatically when a global `afterEach`
  exists (globals give this) (<https://testing-library.com/docs/react-testing-library/api>).
- Query variants: `getBy*` throws on 0 or >1; **`queryBy*`** returns `null` (assert absence);
  **`findBy*`** returns a Promise and retries up to 1000ms (async appearance). `*AllBy*` are the array
  forms (<https://testing-library.com/docs/queries/about>).

## Guiding principles + query priority

- Headline: **"The more your tests resemble the way your software is used, the more confidence they can
  give you."** Test DOM nodes / user behavior, not component instances
  (<https://testing-library.com/docs/guiding-principles>).
- Priority: (1) accessible — **`getByRole`** ("top preference", filter with `{ name: /…/i }`),
  `getByLabelText`, `getByPlaceholderText`, `getByText`, `getByDisplayValue`; (2) semantic —
  `getByAltText`, `getByTitle`; (3) **`getByTestId` = last resort**
  (<https://testing-library.com/docs/queries/about>).

## user-event v14

- Simulates full interactions (multiple events + interactability checks), unlike `fireEvent`'s single
  event. **All interactions are async — always `await`.** Canonical v14: call **`userEvent.setup()`
  before `render`**, then `await user.click(...)` (<https://testing-library.com/docs/user-event/intro>).

## jest-dom matchers + wiring

- Matchers: `toBeInTheDocument`, `toBeVisible`, `toBeDisabled`/`toBeEnabled`, `toHaveValue`,
  `toHaveTextContent`, `toHaveClass`, `toHaveAttribute`, `toHaveFocus`, `toBeChecked`,
  `toHaveAccessibleName`/`toHaveAccessibleDescription`, `toHaveRole`, … .
- **Vitest wiring:** in the setup file put **`import "@testing-library/jest-dom/vitest"`** (the
  Vitest-specific path) — it extends `expect` and registers TS types
  (<https://github.com/testing-library/jest-dom>).

## Do-not-adopt / guardrails on these pins

- **`legacyRoot` render option — do not adopt.** It maps to `ReactDOM.render`, removed in React 19;
  RTL 16 on React 19 errors. Use the default concurrent root
  (<https://testing-library.com/docs/react-testing-library/api>).
- **`@testing-library/react ^16.2.0` needs `@testing-library/dom` as an explicit peer** (RTL 16
  unbundled it) — it must be present or tests fail. 16.2.0 is the React-19 line
  (<https://testing-library.com/docs/react-testing-library/intro>).
- **Don't adopt Vitest v4 config idioms** (e.g. v4 `projects` workspace, v4 mock-default changes) on
  `^3.0.5`; cross-check against the v3 docs since vitest.dev defaults to v4
  (<https://v3.vitest.dev/config/>).
