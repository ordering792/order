import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(errors).toHaveLength(0);
  });

  test("shows profit cards and quick actions", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // At least one of the quick action links should exist
    const depositLink = page.locator('a[href="/deposit"]');
    await expect(depositLink.first()).toBeVisible();
  });

  test("shows navigation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/"]')).toBeVisible();
  });
});
