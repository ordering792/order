import { test, expect, type Page } from "@playwright/test";

const ADMIN_USER = {
  id: "admin-1",
  name: "Admin User",
  phone: "0900000001",
  invitationCode: "ADMIN001",
  role: "admin",
  status: "online",
  balance: "100.00",
};

const USER_A = "user-a";
const USER_B = "user-b";
const USER_C = "user-c";

type PlanRow = {
  _id: string;
  userId: string;
  status: "draft" | "generated" | "completed";
  totalOrders: number;
  completedCount: number;
  user: { _id: string; name: string; phone: string };
};

type DepositSummary = {
  userId: string;
  accepted: { _id: string; amount: string } | null;
  freeAccepted: { _id: string; amount: string } | null;
  pending: { _id: string; amount: string }[];
  balance: string;
};

async function seedAdmin(page: Page) {
  await page.addInitScript(
    ([token, user]) => {
      localStorage.setItem("token", token as string);
      localStorage.setItem("user", JSON.stringify(user));
    },
    ["test-token", ADMIN_USER] as const,
  );
}

async function mockApi(
  page: Page,
  plans: PlanRow[],
  deposits: DepositSummary[],
) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/auth/me")) {
      await route.fulfill({ json: { user: ADMIN_USER } });
      return;
    }

    if (url.includes("/transactions/admin/deposits")) {
      await route.fulfill({ json: { deposits } });
      return;
    }

    if (url.includes("/orders/plans")) {
      await route.fulfill({
        json: { plans, total: plans.length, page: 1, pages: 1 },
      });
      return;
    }

    await route.fulfill({ json: {} });
  });
}

test.describe("Admin order plan page", () => {
  test("shows the deposit badge and status that the API returns", async ({
    page,
  }) => {
    const plans: PlanRow[] = [
      {
        _id: "plan-1",
        userId: USER_A,
        status: "draft",
        totalOrders: 10,
        completedCount: 0,
        user: { _id: USER_A, name: "User A", phone: "0900000002" },
      },
      {
        _id: "plan-2",
        userId: USER_B,
        status: "completed",
        totalOrders: 40,
        completedCount: 40,
        user: { _id: USER_B, name: "User B", phone: "0900000003" },
      },
      {
        _id: "plan-3",
        userId: USER_C,
        status: "draft",
        totalOrders: 5,
        completedCount: 0,
        user: { _id: USER_C, name: "User C", phone: "0900000004" },
      },
    ];

    const deposits: DepositSummary[] = [
      {
        userId: USER_A,
        accepted: { _id: "dep-1", amount: "500.00" },
        freeAccepted: { _id: "dep-1", amount: "500.00" },
        pending: [],
        balance: "0.00",
      },
      {
        userId: USER_B,
        accepted: { _id: "dep-2", amount: "900.00" },
        freeAccepted: null,
        pending: [],
        balance: "0.00",
      },
      {
        // Free deposit မရှိပေမယ့် balance ရှိတဲ့ user — "Balance ready" ပြရမယ်။
        userId: USER_C,
        accepted: { _id: "dep-3", amount: "700.00" },
        freeAccepted: null,
        pending: [],
        balance: "300.00",
      },
    ];

    await seedAdmin(page);
    await mockApi(page, plans, deposits);

    await page.goto("/plans", { waitUntil: "domcontentloaded" });

    // Deposit လက်ခံပြီးသားဖြစ်တဲ့ user ကို "No accepted deposit" လို့ မပြရဘူး။
    await expect(
      page.getByText("Deposit ready", { exact: false }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      page.getByText("No accepted deposit", { exact: false }).filter({
        visible: true,
      }),
    ).toHaveCount(0);

    // Round တစ်ခုမှာ အသုံးပြုပြီးသား deposit ကို အသစ် round အတွက် မသုံးနိုင်ဘူး။
    await expect(
      page.getByText("Deposit already used", { exact: false }).filter({
        visible: true,
      }),
    ).toHaveCount(1);

    // Free deposit မရှိပေမယ့် balance ရှိတဲ့ user က "Balance ready" ပြရမယ်။
    await expect(
      page.getByText("Balance ready", { exact: false }).filter({
        visible: true,
      }),
    ).toHaveCount(1);

    const rows = page.locator("table tbody tr");
    await expect(rows.nth(0)).toContainText("Draft");
    await expect(rows.nth(1)).toContainText("Completed");
    await expect(rows.nth(2)).toContainText("Draft");
  });

  test("reloads the status when the window regains focus", async ({ page }) => {
    const plans: PlanRow[] = [
      {
        _id: "plan-1",
        userId: USER_A,
        status: "draft",
        totalOrders: 10,
        completedCount: 0,
        user: { _id: USER_A, name: "User A", phone: "0900000002" },
      },
    ];

    const deposits: DepositSummary[] = [
      {
        userId: USER_A,
        accepted: { _id: "dep-1", amount: "500.00" },
        freeAccepted: { _id: "dep-1", amount: "500.00" },
        pending: [],
        balance: "0.00",
      },
    ];

    await seedAdmin(page);
    await mockApi(page, plans, deposits);

    await page.goto("/plans", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").nth(0)).toContainText("Draft");

    // Backend က status ပြောင်းပြီးသား — page ကို ပြန်ဝင်လိုက်တာနဲ့ ချက်ချင်း ပြန်စစ်ရမယ်။
    plans[0].status = "generated";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.locator("table tbody tr").nth(0)).toContainText(
      "Generated",
    );
  });
});
