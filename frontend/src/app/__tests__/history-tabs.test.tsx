import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api, ApiTransaction } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import DepositHistoryPage from "@/app/deposit/history/page";

// useAuth must hand back the same object every render — a fresh literal makes
// the page's [user] effect re-run forever and the list never settles.
jest.mock("@/lib/auth", () => {
  const session = { user: { id: "u1" }, loading: false };
  return { useAuth: () => session };
});

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getStoredUser: () => null,
  api: { myTransactions: jest.fn() },
}));

const mockMyTransactions = api.myTransactions as jest.Mock;

const deposit: ApiTransaction = {
  _id: "deposit0000000000000000001",
  userId: "u1",
  type: "deposit",
  amount: "120.00",
  status: "accepted",
  proofScreenshot: "https://ik.imgkit.net/proof.png",
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const withdrawal: ApiTransaction = {
  _id: "withdraw00000000000000000001",
  userId: "u1",
  type: "withdraw",
  amount: "45.00",
  status: "pending",
  proofScreenshot: null,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  mockMyTransactions.mockClear();
  mockMyTransactions.mockResolvedValue({
    transactions: [withdrawal, deposit],
  });
});

const openHistory = () => {
  render(
    <LanguageProvider>
      <DepositHistoryPage />
    </LanguageProvider>,
  );
};

describe("transaction history tabs", () => {
  it("opens on the deposit list", async () => {
    openHistory();

    expect(await screen.findByText("Transaction History")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("$120.00")).toBeInTheDocument());

    expect(screen.queryByText("$45.00")).toBeNull();
    expect(screen.getByText("View Proof")).toBeInTheDocument();
  });

  it("switches to the withdrawal list without refetching", async () => {
    openHistory();
    await waitFor(() => expect(screen.getByText("$120.00")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("history-tab-withdraw"));

    await waitFor(() => expect(screen.getByText("$45.00")).toBeInTheDocument());

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("$120.00")).toBeNull();
    expect(mockMyTransactions).toHaveBeenCalledTimes(1);
  });

  it("shows an empty list when the tab has no rows", async () => {
    mockMyTransactions.mockResolvedValue({ transactions: [deposit] });
    openHistory();
    await waitFor(() => expect(screen.getByText("$120.00")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("history-tab-withdraw"));

    expect(screen.getByText("No transactions found.")).toBeInTheDocument();
  });
});
