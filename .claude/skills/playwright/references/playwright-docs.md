# Playwright + axe — docs digest

**Pinned to:** `@playwright/test ^1.50.1`, `@axe-core/playwright ^4.12.1` (see the repo
`package.json`). Refresh if either bumps a major/minor that changes the idioms below.

**Researched on:** 2026-07-16. A distillation of the CURRENT Playwright Test model, pinned to the
versions above — a summary with citations, not a copy of the docs.

> **Pinning caveat:** playwright.dev serves the latest docs. Two idioms below post-date 1.50.1 and are
> flagged **do not adopt on this pin**: the locator `.filter({ visible: true })` option (added 1.51)
> and the **deprecated** `webServer.port` (use `webServer.url`).

**Official sources:**

- <https://playwright.dev/docs/writing-tests>
- <https://playwright.dev/docs/test-fixtures>
- <https://playwright.dev/docs/locators>
- <https://playwright.dev/docs/best-practices>
- <https://playwright.dev/docs/test-assertions>
- <https://playwright.dev/docs/test-configuration>
- <https://playwright.dev/docs/test-webserver>
- <https://playwright.dev/docs/accessibility-testing>

---

## Test runner + fixtures

- Import **both** `test` and `expect` from the runner: `import { test, expect } from
"@playwright/test";` (<https://playwright.dev/docs/writing-tests>).
- A test is `test("name", async ({ page }) => { … })`; naming a fixture in the destructure
  (`{ page }`) is what tells the runner to set it up. Built-ins: `page` (isolated `Page` per test),
  `context` (its `BrowserContext`), `browser` (shared), `browserName`, `request`
  (`APIRequestContext`) (<https://playwright.dev/docs/test-fixtures>).
- **Isolation is automatic** — each test gets a fresh `BrowserContext`, so no manual state cleanup.
  Group with `test.describe`; share setup with `test.beforeEach` (e.g. logging in) rather than
  ordering tests to depend on each other (<https://playwright.dev/docs/writing-tests>,
  <https://playwright.dev/docs/best-practices>).
- Most tests open with `await page.goto("/")` — relative paths resolve against `use.baseURL`;
  Playwright auto-waits for actionability, so explicit sleeps are unnecessary
  (<https://playwright.dev/docs/writing-tests>).

## Locators + best practices

- **Prefer user-facing locators** over CSS/XPath because "the DOM can often change leading to non
  resilient tests" (<https://playwright.dev/docs/locators>, <https://playwright.dev/docs/best-practices>).
- Methods: **`getByRole(role, { name, exact })`** (reflects assistive-tech perception — top choice),
  `getByLabel` (form controls), `getByText`, `getByPlaceholder`, `getByAltText`, `getByTitle`, and
  `getByTestId` (resilient but not user-facing; attribute set via `use.testIdAttribute`). Example:
  `await page.getByRole("button", { name: "Sign in" }).click();`
  (<https://playwright.dev/docs/locators>).
- Narrow with `.filter({ hasText })` / `.filter({ has })`; locators pierce Shadow DOM by default
  (except XPath) (<https://playwright.dev/docs/locators>).
- **Do not adopt on this pin:** `.filter({ visible: true })` — added in 1.51; use `hasText`/`has`
  filters instead (<https://playwright.dev/docs/locators>).
- Recommended lint guard: `@typescript-eslint/no-floating-promises` catches un-awaited
  assertions/actions (<https://playwright.dev/docs/best-practices>).

## Web-first (auto-retrying) assertions

- Web-first matchers require **`await expect(locator)…`** and auto-retry until the condition holds or
  the timeout (default 5s) elapses — this replaces manual waits and removes flakiness. Common ones:
  `toBeVisible`, `toBeHidden`, `toBeEnabled`, `toBeChecked`, `toBeFocused`, `toHaveText`,
  `toContainText`, `toHaveURL`, `toHaveCount`, `toHaveAttribute`, `toHaveClass`
  (<https://playwright.dev/docs/test-assertions>).
- Prefer `await expect(page.getByText("welcome")).toBeVisible();` over
  `expect(await locator.isVisible()).toBe(true);` — the latter is a non-retrying snapshot and is
  flaky (<https://playwright.dev/docs/best-practices>).
- Generic matchers (`toEqual`, `toBeTruthy`, `toContain`) **do not** retry — correct for already
  resolved synchronous values (e.g. an axe `violations` array via `toEqual([])`), wrong for live DOM.
  `expect.soft(...)` continues after a failure; per-assertion timeout via `expect.configure({
timeout })` (<https://playwright.dev/docs/test-assertions>).

## Config + webServer

- `import { defineConfig, devices } from "@playwright/test"; export default defineConfig({ … })`.
  Relevant keys: `testDir` (`"./e2e"`), `retries` (`process.env.CI ? 2 : 0`),
  `forbidOnly: !!process.env.CI`, `fullyParallel`, `reporter`, and `projects`
  (`{ name, use: { ...devices["Desktop Chrome"] } }`) (<https://playwright.dev/docs/test-configuration>).
- `use` block: **`baseURL`** (relative `goto`/`waitForURL` resolve against it) and
  `trace: "on-first-retry"` (traces only on retry) (<https://playwright.dev/docs/test-configuration>).
- **`webServer`** keys: `command` (`pnpm dev`), `url` (polled until it returns 2xx/3xx/4xx auth
  codes), `reuseExistingServer`, `timeout` (default 60000), plus `cwd`, `env`, `stdout`/`stderr`. The
  CI-safe pattern is **`reuseExistingServer: !process.env.CI`** (reuse a running dev server locally;
  always start fresh in CI) with `use.baseURL` == `webServer.url`
  (<https://playwright.dev/docs/test-webserver>).
- For a configurable port, build **both** `webServer.url` and `use.baseURL` from the same
  `process.env.PLAYWRIGHT_PORT` and pass it into the dev command's env.
  **Do not adopt on this pin:** `webServer.port` is **deprecated** — use `webServer.url`
  (<https://playwright.dev/docs/test-webserver>).

## Accessibility (`@axe-core/playwright`)

- Default import: `import AxeBuilder from "@axe-core/playwright";` Scan the current page with
  `const results = await new AxeBuilder({ page }).analyze();` then assert
  `expect(results.violations).toEqual([]);` (generic `toEqual`, since the result is resolved)
  (<https://playwright.dev/docs/accessibility-testing>).
- Chainable before `.analyze()`: `.include("#region")`, `.exclude("#known-issue")`,
  `.withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"])`, and `.disableRules(["color-contrast"])`
  for temporary, documented suppressions (<https://playwright.dev/docs/accessibility-testing>).
- Documented caveat: automated scans catch only some issues and don't replace manual a11y testing
  (<https://playwright.dev/docs/accessibility-testing>).
