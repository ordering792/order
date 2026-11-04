import { render, screen, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import DashboardPage from "@/app/page";

const mockProfits = api.profits as jest.Mock;
const mockUnreadCount = api.notificationUnreadCount as jest.Mock;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// useAuth must hand back the same object every render — a fresh literal changes
// the effect's `user` dependency and the count request re-fires on every render.
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

const PROFITS = {
  profits: {
    total: "0.00",
    today: "0.00",
    yesterday: "0.00",
    team: "0.00",
  },
};

function renderHome() {
  render(
    <LanguageProvider>
      <DashboardPage />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  mockProfits.mockResolvedValue(PROFITS);
  mockUnreadCount.mockReset();
  mockUnreadCount.mockResolvedValue({ count: 0 });

  // jsdom ရဲ့ visibilityState ကို test တိုင်းမှာ တစ်ပြေးညီ "visible" ဖြစ်အောင်
  // သတ်မှတ်တယ် — foreground ပြန်ရောက်တိုင်း refresh လုပ်တဲ့ လမ်းကြောင်းကို
  // တိုင်းချင်လို့။
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

describe("home notification badge", () => {
  it("puts the unread count on the Notifications tile", async () => {
    mockUnreadCount.mockResolvedValue({ count: 3 });

    renderHome();

    const badge = await screen.findByTestId("notification-badge");

    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAccessibleName("3 unread");
  });

  it("renders nothing on the tile once the count is zero", async () => {
    mockUnreadCount.mockResolvedValue({ count: 0 });

    renderHome();

    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalled());
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("caps a large count instead of stretching the circle", async () => {
    mockUnreadCount.mockResolvedValue({ count: 140 });

    renderHome();

    expect(await screen.findByTestId("notification-badge")).toHaveTextContent(
      "99+",
    );
  });

  it("leaves the other quick actions without a badge", async () => {
    mockUnreadCount.mockResolvedValue({ count: 5 });

    renderHome();

    await screen.findByTestId("notification-badge");
    expect(screen.getAllByTestId("notification-badge")).toHaveLength(1);
  });

  // Ruling: pull-based — socket push မသုံးဘူး, app ပြန်ဖွင့်တဲ့အခါ ပြန်မေးတယ်။
  it("asks again when the app comes back to the foreground", async () => {
    mockUnreadCount.mockResolvedValue({ count: 1 });

    renderHome();

    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalledTimes(2));
  });

  it("keeps the last count when the request fails", async () => {
    mockUnreadCount.mockResolvedValue({ count: 4 });

    renderHome();

    await screen.findByTestId("notification-badge");

    mockUnreadCount.mockRejectedValue(new Error("network down"));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("4");
  });
});
