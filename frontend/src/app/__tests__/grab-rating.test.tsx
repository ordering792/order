import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n";
import { api } from "@/lib/api";
import GrabPage from "@/app/grab/page";

const mockPush = jest.fn();
const mockGrabSummary = api.grabSummary as jest.Mock;
const mockMatchOrder = api.matchOrder as jest.Mock;
const mockSubmitOrder = api.submitOrder as jest.Mock;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

function starButtons() {
  const group = screen.getByText("Rate this product").parentElement;
  if (!group) throw new Error("rating group is missing");
  return within(group).getAllByRole("button");
}

async function openOrderCard() {
  render(
    <LanguageProvider>
      <GrabPage />
    </LanguageProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: /begin matching/i }));
  return screen.findByText("Rate this product");
}

beforeEach(() => {
  mockPush.mockClear();
  mockGrabSummary.mockReset();
  // Card test တွေက summary ကို မဖတ်ဘူး။ resolve မလုပ်ထားမှ mount effect က
  // setSummary ကို act အပြင်မှာ မခေါ်လို့ jest သတိမထွက်ဘူး။
  mockGrabSummary.mockReturnValue(new Promise(() => {}));
  mockMatchOrder.mockReset();
  mockMatchOrder.mockResolvedValue({
    order: ORDER,
    needsDeposit: false,
    shortBy: "0.00",
  });
  mockSubmitOrder.mockReset();
  mockSubmitOrder.mockResolvedValue({ task: ORDER });
});

describe("grab order card rating gate", () => {
  it("blocks Submit Order until a star is picked and shows the hint", async () => {
    await openOrderCard();

    expect(starButtons()).toHaveLength(5);
    expect(
      screen.getByText("Rate the product to submit this order"),
    ).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /submit order/i });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(mockSubmitOrder).not.toHaveBeenCalled();
  });

  it("sends the picked star as the only input once the rating is set", async () => {
    await openOrderCard();

    fireEvent.click(starButtons()[3]);

    expect(
      screen.queryByText("Rate the product to submit this order"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit order/i })).toBeEnabled();

    // submit ရဲ့ finally setState က async ဆုံးတဲ့အထိ ခေါ်တယ် — act ထဲ နှိမ့်မယ်။
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit order/i }));
    });

    expect(mockSubmitOrder).toHaveBeenCalledWith("task-1", { rating: 4 });
  });

  it("has no comment box left on the card", async () => {
    await openOrderCard();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Feedback / Comments")).not.toBeInTheDocument();
  });
});
