import { render, screen, waitFor } from "@testing-library/react";
import { api, ApiTransaction } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import NotificationsPage from "@/app/notifications/page";

// useAuth must hand back the same object every render — a fresh literal makes
// the page's [user, load] effect re-run forever and the feed never settles.
jest.mock("@/lib/auth", () => {
  const session = { user: { id: "u1" }, loading: false };
  return { useAuth: () => session };
});

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getStoredUser: () => null,
  api: {
    get: jest.fn(),
    myTransactions: jest.fn(),
    myOrders: jest.fn(),
    markNotificationsSeen: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockMyTransactions = api.myTransactions as jest.Mock;
const mockMyOrders = api.myOrders as jest.Mock;
const mockMarkSeen = api.markNotificationsSeen as jest.Mock;

const transaction = (
  overrides: Partial<ApiTransaction> = {},
): ApiTransaction => ({
  _id: "tx-1",
  userId: "u1",
  type: "deposit",
  amount: "50.00",
  status: "pending",
  proofScreenshot: null,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const openNotifications = () => {
  render(
    <LanguageProvider>
      <NotificationsPage />
    </LanguageProvider>,
  );
};

beforeEach(() => {
  mockGet.mockResolvedValue({ announcements: [] });
  mockMyTransactions.mockResolvedValue({ transactions: [] });
  mockMyOrders.mockResolvedValue({ tasks: [], plan: null });
  mockMarkSeen.mockResolvedValue({ count: 0 });
});

describe("notification feed", () => {
  it("keeps order activity out of the feed", async () => {
    mockMyOrders.mockResolvedValue({
      tasks: [
        {
          _id: "task-1",
          orderNumber: 40,
          productName: "Rakuten",
          status: "completed",
          commission: "0.60",
          completedAt: new Date().toISOString(),
        },
      ],
      plan: null,
    });

    openNotifications();
    await waitFor(() => expect(screen.getByText("Notifications")).toBeInTheDocument());

    expect(mockMyOrders).not.toHaveBeenCalled();
    expect(screen.queryByText(/Order #/)).toBeNull();
  });

  it("turns a pending deposit into a review alert", async () => {
    mockMyTransactions.mockResolvedValue({ transactions: [transaction()] });

    openNotifications();
    await waitFor(() =>
      expect(screen.getByText("Deposit pending")).toBeInTheDocument(),
    );

    expect(screen.getByText("$50.00 is awaiting review")).toBeInTheDocument();
  });

  it("rewrites the same card once the admin accepts the deposit", async () => {
    mockMyTransactions.mockResolvedValue({
      transactions: [transaction({ status: "accepted" })],
    });

    openNotifications();
    await waitFor(() =>
      expect(screen.getByText("Deposit accepted")).toBeInTheDocument(),
    );

    expect(screen.getByText("$50.00 credited to your balance")).toBeInTheDocument();
    expect(screen.queryByText("Deposit pending")).toBeNull();
    expect(screen.getAllByText(/^Deposit/)).toHaveLength(1);
  });

  it("reports a rejected withdrawal as returned money", async () => {
    mockMyTransactions.mockResolvedValue({
      transactions: [
        transaction({ type: "withdraw", amount: "20.00", status: "rejected" }),
      ],
    });

    openNotifications();
    await waitFor(() =>
      expect(screen.getByText("Withdrawal rejected")).toBeInTheDocument(),
    );

    expect(screen.getByText("$20.00 returned to your balance")).toBeInTheDocument();
  });

  it("keeps announcements in the feed", async () => {
    mockGet.mockResolvedValue({
      announcements: [
        {
          _id: "ann-1",
          title: "System maintenance",
          content: "Tonight at 10pm",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    openNotifications();
    await waitFor(() =>
      expect(screen.getByText("System maintenance")).toBeInTheDocument(),
    );

    expect(screen.getByText("Tonight at 10pm")).toBeInTheDocument();
  });

  it("caps the feed at the latest twenty cards", async () => {
    mockMyTransactions.mockResolvedValue({
      transactions: Array.from({ length: 25 }, (_, index) =>
        transaction({
          _id: `tx-${index}`,
          amount: `${index + 1}.00`,
          createdAt: new Date(Date.now() - index * 60000).toISOString(),
        }),
      ),
    });

    openNotifications();
    await waitFor(() =>
      expect(screen.getAllByText("Deposit pending")).toHaveLength(20),
    );

    expect(screen.getByText("$1.00 is awaiting review")).toBeInTheDocument();
    expect(screen.queryByText("$25.00 is awaiting review")).toBeNull();
  });
});

describe("read stamp for the home badge", () => {
  beforeEach(() => {
    mockMarkSeen.mockClear();
  });

  it("stamps the feed read once it is on screen", async () => {
    mockGet.mockResolvedValue({
      announcements: [
        {
          _id: "ann-1",
          title: "System maintenance",
          content: "Tonight at 10pm",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    openNotifications();

    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalledTimes(1));
  });

  // ဘယ် source မှ မရလို့ feed အလွတ်ဖြစ်တဲ့အခါ seen ချရင် အသစ်တွေ
  // ပျောက်သွားမယ် — badge ကို မဖျောက်ဘူး။
  it("leaves the stamp alone when nothing could be loaded", async () => {
    mockGet.mockRejectedValue(new Error("network down"));
    mockMyTransactions.mockRejectedValue(new Error("network down"));

    openNotifications();

    await waitFor(() =>
      expect(screen.getByText("No notifications yet")).toBeInTheDocument(),
    );

    expect(mockMarkSeen).not.toHaveBeenCalled();
  });
});
