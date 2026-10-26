import { test, expect } from "@playwright/test";

test.describe("Orders page", () => {
  test("renders orders page", async ({ page }) => {
    await page.goto("/orders", { waitUntil: "domcontentloaded" });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
});
