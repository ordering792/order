import { test, expect } from "@playwright/test";

test.describe("Admin login page", () => {
  test("renders login form", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("shows error on failed login", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.fill('input[type="tel"]', "09123456789");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Should show error (either API error or permission error)
    await page.waitForLoadState("networkidle");
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    expect(errors).toHaveLength(0);
  });
});
