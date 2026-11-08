import { render, screen } from "@testing-library/react";
import type { ApiAdminStats } from "@/lib/api";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminDashboardPage from "@/app/page";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      adminStats: jest.fn(),
    },
  };
});

const BASE_STATS: ApiAdminStats = {
  totalUsers: 6,
  totalOwners: 3,
  totalProducts: 500,
  pendingDeposits: 1,
  pendingWithdraws: 2,
  acceptedVolume: 0,
  totalPlans: 4,
  generatedPlans: 1,
  completedPlans: 0,
};

async function renderPage(overrides: Partial<ApiAdminStats> = {}) {
  (api.adminStats as jest.Mock).mockReset().mockResolvedValue({
    stats: { ...BASE_STATS, ...overrides },
  });

  render(
    <LanguageProvider>
      <AdminDashboardPage />
    </LanguageProvider>,
  );

  return screen.findByText("Accepted volume");
}

describe("Admin dashboard stats", () => {
  it("reads the accepted volume out of the Decimal128 payload", async () => {
    await renderPage({ acceptedVolume: { $numberDecimal: "1284.56" } });

    expect(await screen.findByText("$1284.56")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[object Object]");
  });

  it("prints a large volume without group separators, like the money cells elsewhere", async () => {
    await renderPage({ acceptedVolume: { $numberDecimal: "1523480.50" } });

    expect(await screen.findByText("$1523480.50")).toBeInTheDocument();
  });

  it("shows a formatted zero when no deposit has been accepted", async () => {
    await renderPage({ acceptedVolume: 0 });

    expect(await screen.findByText("$0.00")).toBeInTheDocument();
  });
});
