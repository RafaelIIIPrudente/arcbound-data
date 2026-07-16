---
name: playwright
description: Use when writing or reviewing end-to-end / a11y tests in this repo — enforces Playwright idioms (user-facing locators, web-first auto-retrying assertions, webServer config, axe scans) and this repo's e2e conventions; keeps us aligned with current Playwright docs.
---

# Playwright + axe (stack alignment)

Keep this repo's e2e and accessibility tests aligned with **Playwright Test** as pinned. The distilled,
cited docs live in [`references/playwright-docs.md`](references/playwright-docs.md); the wiring is in
[`playwright.config.ts`](../../../playwright.config.ts) and [`e2e/`](../../../e2e). The gate is
`pnpm test:e2e` (unit tests are the [`vitest-testing-library`](../vitest-testing-library/SKILL.md)
skill's job).

## When to use

- Adding or reviewing a spec under `e2e/` (a smoke flow, a navigation/redirect check, an axe scan).
- Touching `playwright.config.ts` (the `webServer`, `baseURL`, `projects`, or retries).
- Any time a locator reaches for a CSS/XPath selector, or an assertion isn't `await expect(...)`.

## Pinned version

From `package.json`: `@playwright/test ^1.50.1`, `@axe-core/playwright ^4.12.1`. Config lives in
`playwright.config.ts`; `testDir: "./e2e"`. **Two live-docs idioms post-date this pin** — do **not**
adopt `.filter({ visible: true })` (added 1.51) or the deprecated `webServer.port` (use
`webServer.url`).

## Current idioms (Playwright 1.50)

Sourced + cited in [`references/playwright-docs.md`](references/playwright-docs.md):

- **Import `test` + `expect` from `@playwright/test`;** a test names the fixtures it needs
  (`async ({ page }) => …`). Isolation is automatic (fresh `BrowserContext` per test).
- **User-facing locators** — `getByRole(role, { name })` first, then `getByLabel`/`getByText`;
  `getByTestId` is the escape hatch. The DOM changes; role/label selectors survive.
- **Web-first, auto-retrying assertions** — always `await expect(locator).toBeVisible()` /
  `.toHaveURL(...)`; never `expect(await locator.isVisible()).toBe(true)` (non-retrying, flaky).
  Generic matchers (`toEqual([])`) are correct only for already-resolved values (e.g. axe
  `violations`).
- **`defineConfig` + `webServer`** — `command`, `url`, `reuseExistingServer: !process.env.CI`,
  `use.baseURL` == `webServer.url`; relative `page.goto("/")` resolves against `baseURL`.
- **a11y via `AxeBuilder`** — `await new AxeBuilder({ page }).analyze()`, assert
  `violations` is empty; scope with `.withTags`, suppress a known rule with `.disableRules([...])`.

## This repo's conventions

- **`playwright.config.ts`** — `testDir: "./e2e"`, `fullyParallel`, `forbidOnly`/`retries: 2` under
  CI, one **`chromium`** project, `trace: "on-first-retry"`. **Port is configurable via
  `PLAYWRIGHT_PORT`** (default 3000) and both `baseURL` and `webServer.url` are built from it. The
  `webServer` runs **`pnpm dev`** and injects **placeholder Supabase env** so the app boots in
  auth-enabled mode for the redirect tests.
- **`reuseExistingServer: !process.env.CI`** — locally Playwright reuses a running dev server. Gotcha:
  if your port-3000 dev server is running **auth-disabled** (no Supabase env), the auth-gate specs
  fail against it. Run e2e on a dedicated port (e.g. `PLAYWRIGHT_PORT=3200 pnpm test:e2e`) or stop the
  ad-hoc server so Playwright starts its own.
- **`e2e/auth-smoke.spec.ts`** — the reference: unauthenticated `goto("/")` and `goto("/clients")`
  both `toHaveURL(/\/login/)`, and the login screen shows a `getByRole("button", { name: /sign in/i
})`. This encodes the single-tenant auth gate (SRS §2).
- **`e2e/a11y.spec.ts`** — scans the **session-free** pages (`/login`, `/auth/reset-password`) with
  `AxeBuilder`, failing on **serious/critical** impacts only. It **`.disableRules(["color-contrast"])`**
  as flagged, known debt (the `muted-foreground` token — a T6 design pass); don't silently widen that
  suppression.

## Banned / outdated

- **No CSS/XPath selectors** where a role/label/text locator works — they're brittle.
- **No non-retrying assertions** — never `expect(await locator.isVisible()).toBe(true)`; use
  `await expect(locator)...`.
- **Don't adopt on this pin** — `.filter({ visible: true })` (1.51+) or `webServer.port` (deprecated;
  use `webServer.url`).
- **Don't broaden the `color-contrast` suppression** or disable more axe rules to make a spec pass —
  the suppression is documented, scoped debt; fix the token in the T6 a11y pass instead.
- **Keep e2e out of the unit run** — specs live in `e2e/`, excluded from the Vitest `include`.

## Common tasks

- **A smoke/redirect flow:** `await page.goto("/route"); await expect(page).toHaveURL(...)`; assert a
  visible role locator. Copy `auth-smoke.spec.ts`.
- **An a11y scan of a new public page:** add its path to the `a11y.spec.ts` loop; keep the
  serious/critical gate; only add a `disableRules` entry with a `TODO(a11y)` + rationale.
- **Run against a clean server:** `PLAYWRIGHT_PORT=3200 pnpm test:e2e` (avoids reusing an
  auth-disabled dev server).

## Refresh

1. Re-run **`/research`** against playwright.dev (writing-tests, locators, best-practices,
   test-assertions, test-configuration, test-webserver, accessibility-testing) — **pin to 1.50** and
   flag any newer-only idioms.
2. Update [`references/playwright-docs.md`](references/playwright-docs.md) — digest, **Official
   sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when Playwright changes minor/major** and re-check the flagged deltas
   (`.filter({ visible })`, `webServer.port`).
