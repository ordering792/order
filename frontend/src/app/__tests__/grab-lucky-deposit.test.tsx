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

const LUCKY_ORDER = {
  id: "task-lucky",
  orderNumber: 1,
  orderId: "ORD-LUCKY",
  productName: "Lucky product",
  productImage: null,
  description: "Lucky description",
  category: "tech",
  code: "LUCKY-1",
  price: "100.00",
  profit: "2.00",
  requireDeposit: "3500.00",
  paidDeposit: "0.00",
  isLuckyOrder: true,
  totalAmount: "3602.00",
  status: "assigned",
  assignedAt: null,
  submittedAt: null,
  rating: null,
  feedback: null,
};

const CONGRATS_TITLE = "Congratulations on receiving a lucky order!";
const CONGRATS_BODY =
  "Make a temporary deposit to complete this order and earn a larger commission";

// activeOrder ပါတဲ့ summary = instant reopen, ၃ စက္ကန့် hold ကို ဖြတ်တယ်။
async function openLuckyCard() {
  await act(async () => {
    render(
      <LanguageProvider>
        <GrabPage />
      </LanguageProvider>,
    );
  });

  fireEvent.click(screen.getByRole("button", { name: /begin matching/i }));
  return screen.findByText(CONGRATS_TITLE);
}

beforeEach(() => {
  mockGrabSummary.mockReset();
  mockGrabSummary.mockResolvedValue({
    summary: {
      balance: "100.00",
      totalCommission: "0.00",
      freezeBalance: "0.00",
      totalOrderNumber: 10,
      vipLevel: "FREE VIP",
      commissionRate: "0.50%",
      completedCount: 0,
      remainingCount: 10,
      undoneCount: 1,
      activeOrder: LUCKY_ORDER,
    },
  });
  mockMatchOrder.mockReset();
  mockMatchOrder.mockResolvedValue({
    order: LUCKY_ORDER,
    needsDeposit: true,
    shortBy: "3500.00",
  });
});

describe("grab lucky deposit box", () => {
  it("replaces the red warning with the amber congratulations copy", async () => {
    const title = await openLuckyCard();

    expect(title).toBeInTheDocument();
    expect(screen.getByText(CONGRATS_BODY)).toBeInTheDocument();

    expect(
      screen.queryByText("Separate deposit required!"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Deposit .* more to complete/)).not.toBeInTheDocument();

    // celebratory palette — စာသားနဲ့ လိုက်ဖက်တဲ့ အရောင်
    const box = title.closest('[class*="bg-amber-50"]');
    expect(box).not.toBeNull();
    expect(box?.className).toContain("border-amber-200");
    expect(box?.className).not.toContain("bg-rose-50");
  });

  it("no longer prints the shortfall amount inside the box", async () => {
    const title = await openLuckyCard();
    const box = title.closest('[class*="bg-amber-50"]');

    expect(box?.textContent).not.toContain("3,500");
    expect(box?.textContent).not.toContain("{amount}");
  });

  it("offers Deposit Now and hides Submit Order while the deposit is missing", async () => {
    await openLuckyCard();

    const deposit = screen.getByRole("link", { name: /deposit now/i });
    expect(deposit).toHaveAttribute("href", "/deposit");
    expect(deposit.className).toContain("from-[#ff782d]");
    expect(deposit.className).not.toContain("from-rose-500");

    expect(
      screen.queryByRole("button", { name: /submit order/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the lucky sentence out of the rules card", async () => {
    await openLuckyCard();

    const rules = screen.getByText(/Orders must be completed in order/);
    expect(rules.textContent).not.toMatch(/higher commission/i);
    expect(rules.textContent).not.toMatch(/Lucky Order/i);
    expect(rules.textContent).toContain(
      "Withdrawals unlock only after every order in your plan is completed.",
    );
  });
});
