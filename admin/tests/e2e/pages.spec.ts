import { test, expect } from "@playwright/test";

test.describe("Admin pages", () => {
  const pages = [
    { name: "Dashboard", path: "/" },
    { name: "Products", path: "/products" },
    { name: "Transactions", path: "/transactions" },
    { name: "Users", path: "/users" },
    { name: "Plans", path: "/plans" },
    { name: "Support", path: "/support" },
  ];

  for (const { name, path } of pages) {
    test(`renders ${name} page without errors`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.waitForLoadState("domcontentloaded");
      expect(errors).toHaveLength(0);
    });
  }
});
