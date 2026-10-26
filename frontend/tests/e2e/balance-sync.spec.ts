import { test, expect } from "@playwright/test";

// Balance sync: grab page reads /tasks/summary (always fresh), home + profile
// read the cached auth user. The server already credited a commission, so the
// stored balance (100.00) is stale while the API says 125.50.
const STALE_BALANCE = "100.00";
const FRESH_BALANCE = "125.50";

const serverUser = {
  _id: "e2e-user",
  id: "e2e-user",
  name: "E2E User",
  phone: "09123456789",
  role: "user",
  invitationCode: "E2ECODE",
  language: "en",
  balance: FRESH_BALANCE,
};

test.describe("Balance stays in sync across grab, home and profile", () => {
  test.beforeEach(async ({ page }) => {

    await page.addInitScript(
      (staleUser) => {
        localStorage.setItem("token", "e2e-token");
        localStorage.setItem("user", JSON.stringify(staleUser));
        localStorage.setItem("language", "en");
      },
      { ...serverUser, balance: STALE_BALANCE },
    );

    await page.route("**/api/**", (route) =>
      route.fulfill({ json: {} }),
    );
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ json: { user: serverUser } }),
    );
    await page.route("**/api/auth/profits", (route) =>
      route.fulfill({
        json: {
          profits: {
            total: "0.00",
            today: "0.00",
            yesterday: "0.00",
            team: "0.00",
          },
        },
      }),
    );
    await page.route("**/api/tasks/summary", (route) =>
      route.fulfill({
        json: {
          summary: {
            balance: FRESH_BALANCE,
            totalCommission: "25.50",
            freezeBalance: "0.00",
            totalOrderNumber: 5,
            vipLevel: "FREE VIP",
            commissionRate: "0.50%",
            completedCount: 1,
            remainingCount: 4,
            undoneCount: 0,
            activeOrder: null,
          },
        },
      }),
    );
    await page.route("**/api/tasks/orders", (route) =>
      route.fulfill({ json: { tasks: [], plan: null } }),
    );
  });

  test("home and profile show the same fresh balance as grab", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const fresh = page
      .getByText(FRESH_BALANCE)
      .filter({ visible: true })
      .first();
    const stale = page.getByText(STALE_BALANCE).filter({ visible: true });

    await page.goto("/grab", { waitUntil: "domcontentloaded" });
    await expect(fresh).toBeVisible({ timeout: 30000 });

    // client-side navigation, exactly how a user leaves the grab page
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(fresh).toBeVisible({ timeout: 30000 });
    await expect(stale).toHaveCount(0);

    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(fresh).toBeVisible({ timeout: 30000 });
    await expect(stale).toHaveCount(0);
  });
});
