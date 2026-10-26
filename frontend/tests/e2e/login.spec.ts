import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders login form with phone and password fields", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    // Check key form elements exist
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("shows sign up link", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });

  test("submits form without crashing", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.fill('input[type="tel"]', "09123456789");
    await page.fill('input[type="password"]', "password123");

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    // Login may fail without a backend — page should not crash
    expect(errors).toHaveLength(0);
  });
});
