import { expect, test } from "@playwright/test";

test("marketing landing renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ship your next app/i })).toBeVisible();
});

test("dashboard redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});
