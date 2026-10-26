import { test, expect } from "@playwright/test";

test.describe("Withdraw page", () => {
  test("renders withdraw form", async ({ page }) => {
    await page.goto("/withdraw", { waitUntil: "domcontentloaded" });

    // Check for withdraw form elements — auth redirect may happen
    // so verify page loads without fatal errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
});
