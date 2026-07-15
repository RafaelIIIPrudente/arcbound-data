import { expect, test } from "@playwright/test";

// ArcBase is internal and single-tenant: every route except /login (and the
// retained auth callback / password-reset routes) is auth-gated (SRS §2).

test("unauthenticated users are redirected to the login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});

test("a protected app route also redirects to /login", async ({ page }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);
});
