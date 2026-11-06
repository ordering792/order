import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n";
import { api } from "@/lib/api";
import GrabPage from "@/app/grab/page";

const mockGrabSummary = api.grabSummary as jest.Mock;
const mockMatchOrder = api.matchOrder as jest.Mock;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

jest.mock("@/lib/socket", () => ({ getSocket: () => null }));

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getStoredUser: () => null,
  api: {
    grabSummary: jest.fn(),
    matchOrder: jest.fn(),
    submitOrder: jest.fn(),
  },
}));

const ORDER = {
  id: "task-1",
  orderNumber: 1,
  orderId: "ORD-001",
  productName: "Test product",
  productImage: null,
  description: "Test description",
  category: "tech",
  code: "CODE-1",
  price: "100.00",
  profit: "0.50",
  requireDeposit: "0.00",
  paidDeposit: "0.00",
  isLuckyOrder: false,
  totalAmount: "100.50",
  status: "assigned",
  assignedAt: null,
  submittedAt: null,
  rating: null,
  feedback: null,
};

const STAGE_1 = "Searching for available products...";
const STAGE_2 = "Matching a buyer...";
const STAGE_3 = "Order secured...";

// summary.activeOrder က instant-reopen branch ရဲ့ တံခါး — ဒါပါရင် ၃ စက္ကန့် မခံဘူး။
function summaryFor(activeOrder: unknown) {
  return {
    summary: {
      balance: "100.00",
      totalCommission: "0.00",
      freezeBalance: "0.00",
      totalOrderNumber: 10,
      vipLevel: "FREE VIP",
      commissionRate: "0.50%",
      completedCount: 0,
      remainingCount: 10,
      undoneCount: 0,
      activeOrder,
    },
  };
}

async function mount(activeOrder: unknown) {
  mockGrabSummary.mockResolvedValue(summaryFor(activeOrder));

  await act(async () => {
    render(
      <LanguageProvider>
        <GrabPage />
      </LanguageProvider>,
    );
  });
}

// click ထဲက async chain (matchOrder resolve → hold timer စတင်) ကို
// microtask တွေနဲ့ flush တယ် — timer မတိုးဘူး၊ hold ဆက်ကြာတယ်။
async function clickBeginMatching() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /begin matching/i }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockGrabSummary.mockReset();
  mockMatchOrder.mockReset();
  mockMatchOrder.mockResolvedValue({
    order: ORDER,
    needsDeposit: false,
    shortBy: "0.00",
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("grab matching delay", () => {
  it("holds a fresh match for 3s and reveals the product after", async () => {
    await mount(null);
    await clickBeginMatching();

    expect(screen.queryByText("Test product")).not.toBeInTheDocument();
    expect(screen.getByText(STAGE_1)).toBeInTheDocument();

    await advance(2999);
    expect(screen.queryByText("Test product")).not.toBeInTheDocument();

    await advance(1);
    expect(screen.getByText("Test product")).toBeInTheDocument();
    expect(mockMatchOrder).toHaveBeenCalledTimes(1);
  });

  it("walks the spinner copy through the three stages", async () => {
    await mount(null);
    await clickBeginMatching();

    expect(screen.getByText(STAGE_1)).toBeInTheDocument();

    await advance(1000);
    expect(screen.getByText(STAGE_2)).toBeInTheDocument();
    expect(screen.queryByText(STAGE_1)).not.toBeInTheDocument();

    await advance(1200);
    expect(screen.getByText(STAGE_3)).toBeInTheDocument();
    expect(screen.queryByText(STAGE_2)).not.toBeInTheDocument();

    // hold ဆက်ရှိတယ် — စာကြောင်း ၃ ခုလုံးက card မပေါ်ခင်အထိ ပြတယ်
    expect(screen.queryByText("Test product")).not.toBeInTheDocument();

    await advance(800);
    expect(screen.getByText("Test product")).toBeInTheDocument();
  });

  it("reopens an existing active order without the delay", async () => {
    await mount(ORDER);
    await clickBeginMatching();

    expect(screen.getByText("Test product")).toBeInTheDocument();
    expect(screen.queryByText(STAGE_1)).not.toBeInTheDocument();
  });

  it("shows a match error right away instead of holding 3s", async () => {
    await mount(null);
    mockMatchOrder.mockRejectedValue(
      new Error("No order plan found — ask an administrator to assign orders"),
    );

    await clickBeginMatching();

    expect(
      screen.getByText(/ask an administrator to assign orders/),
    ).toBeInTheDocument();
    expect(screen.queryByText(STAGE_1)).not.toBeInTheDocument();
    expect(screen.queryByText("Test product")).not.toBeInTheDocument();
  });
});
