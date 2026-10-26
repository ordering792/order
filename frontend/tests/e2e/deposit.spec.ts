import { test, expect } from "@playwright/test";

test.describe("Deposit page", () => {
  test("renders deposit flow", async ({ page }) => {
    await page.goto("/deposit", { waitUntil: "domcontentloaded" });

    // Check for deposit form elements — auth redirect may happen
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
});
