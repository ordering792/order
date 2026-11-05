import { render, screen } from "@testing-library/react";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import DashboardPage from "@/app/page";

const mockProfits = api.profits as jest.Mock;
const mockUnreadCount = api.notificationUnreadCount as jest.Mock;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => {
  const session = { user: { id: "u1", balance: "1325.76" }, loading: false };
  return { useAuth: () => session };
});

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getStoredUser: () => null,
  api: {
    profits: jest.fn(),
    notificationUnreadCount: jest.fn(),
  },
}));

beforeEach(() => {
  mockProfits.mockResolvedValue({
    profits: { total: "0.00", today: "0.00", yesterday: "0.00", team: "0.00" },
  });
  mockUnreadCount.mockResolvedValue({ count: 0 });
  localStorage.setItem("language", JSON.stringify({ name: "日本語", code: "jp" }));
});

afterEach(() => localStorage.removeItem("language"));

// ဒီ ticker ကို JSX ထဲ literal အတိုင်းရေးထားတဲ့အခါ ဘာသာစကား ပြောင်းလည်း
// English ပဲ ပြနေခဲ့တယ် — locale parity test က dictionary key တွေပဲ စစ်တဲ့အတွက်
// မဖမ်းနိုင်။ ဒီ test က အဲဒီအတန်းသစ် bug ကို ဖမ်းတယ်။
describe("home commission ticker i18n", () => {
  function renderJaHome() {
    render(
      <LanguageProvider>
        <DashboardPage />
      </LanguageProvider>,
    );
  }

  it("translates the ticker heading", () => {
    renderJaHome();

    expect(
      screen.getByText("ユーザーコミッション収入の動き"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("User commission income dynamics"),
    ).toBeNull();
  });

  it("translates the per-row commission label", () => {
    renderJaHome();

    expect(screen.getAllByText("コミッション").length).toBeGreaterThan(0);
    expect(screen.queryByText("Commission")).toBeNull();
  });

  it("labels the avatar image in the active language", () => {
    renderJaHome();

    expect(screen.getAllByAltText("ユーザーアバター").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryAllByAltText("User Avatar")).toHaveLength(0);
  });

  // App အစစ်က USDT (TRC20) သုံးတဲ့အတွက် ticker မှာ USD လို့ မပြရ။
  it("shows USDT, never USD", () => {
    renderJaHome();

    expect(screen.getAllByText("USDT").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("USD")).toHaveLength(0);
  });
});
