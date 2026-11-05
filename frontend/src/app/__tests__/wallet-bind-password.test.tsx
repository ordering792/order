import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api, ApiError, type ApiUser } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import BindWalletPage from "@/app/wallet_bind/page";

const TRON_ADDRESS = "TQSVhFzR7pN3yKdLmXcBv8tGnWqJs4Yp2r";

const mockUpdateWalletAddress = api.updateWalletAddress as jest.Mock;

// useAuth ရဲ့ object ကို တစ်ခါပဲ ဆောက်တယ် — render တိုင်း အသစ်ပေးရင်
// RequireAuth က loading ကူးပြီး တစ်ခါတည်း ပြေလည်သွားအောင် တားမိတယ်။
let mockSession: { user: ApiUser | null; loading: boolean; refreshUser: jest.Mock };

jest.mock("@/lib/auth", () => ({
  useAuth: () => mockSession,
}));

// ApiError ကို status နဲ့တကယ် ပြန်ပေးရမယ် — page က 400/409/422 ကို ခွဲရအောင်။
jest.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    getStoredUser: () => null,
    api: { updateWalletAddress: jest.fn() },
  };
});

const user = (overrides: Partial<ApiUser> = {}): ApiUser => ({
  id: "u1",
  name: "Test User",
  phone: "09111000111",
  invitationCode: "TEST001",
  role: "user",
  ...overrides,
});

async function fillBindForm(password: string) {
  fireEvent.change(screen.getByPlaceholderText("Enter your USDT wallet address"), {
    target: { value: TRON_ADDRESS },
  });
  if (password) {
    fireEvent.change(screen.getByTestId("bind-wallet-password"), {
      target: { value: password },
    });
  }

  // submit handler က async — toast နဲ့ isSaving setState တွေ act ထဲ ကျအောင်။
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save wallet address/i }));
  });
}

beforeEach(() => {
  mockUpdateWalletAddress.mockReset();
  // အောင်ရင် page က /withdraw ကို ရွှေ့တယ် (window.location) — jest မှာ
  // navigation မရှိလို့ redirect မှာ ပါသွားအောင် pending ထားတယ်။
  mockUpdateWalletAddress.mockReturnValue(new Promise(() => {}));

  mockSession = { user: user(), loading: false, refreshUser: jest.fn() };
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("bind withdrawal wallet password gate", () => {
  it("puts a login password box inside the bind card", () => {
    render(
      <LanguageProvider>
        <BindWalletPage />
      </LanguageProvider>,
    );

    expect(screen.getByText("Login Password")).toBeInTheDocument();
    expect(screen.getByTestId("bind-wallet-password")).toBeInTheDocument();
  });

  it("refuses to send the bind while the password box is empty", async () => {
    render(
      <LanguageProvider>
        <BindWalletPage />
      </LanguageProvider>,
    );

    await fillBindForm("");

    expect(mockUpdateWalletAddress).not.toHaveBeenCalled();
    expect(await screen.findByText("Please enter your login password!")).toBeInTheDocument();
  });

  it("sends the login password together with the address", async () => {
    render(
      <LanguageProvider>
        <BindWalletPage />
      </LanguageProvider>,
    );

    await fillBindForm("user123456");

    await waitFor(() =>
      expect(mockUpdateWalletAddress).toHaveBeenCalledWith(TRON_ADDRESS, "user123456"),
    );
  });

  it("names the password as the problem when the backend rejects it", async () => {
    mockUpdateWalletAddress.mockRejectedValue(new ApiError(422, "Incorrect password"));

    render(
      <LanguageProvider>
        <BindWalletPage />
      </LanguageProvider>,
    );

    await fillBindForm("wrong");

    expect(
      await screen.findByText("Your login password is incorrect. Please try again."),
    ).toBeInTheDocument();
  });

  it("says the address is already saved when a second bind is refused", async () => {
    mockUpdateWalletAddress.mockRejectedValue(
      new ApiError(409, "Your wallet address is already saved and cannot be changed from here"),
    );

    render(
      <LanguageProvider>
        <BindWalletPage />
      </LanguageProvider>,
    );

    await fillBindForm("user123456");

    expect(
      await screen.findByText(
        "This wallet address is already saved. Only support can change it.",
      ),
    ).toBeInTheDocument();
  });

  it("locks a bound address read-only instead of offering the form", () => {
    mockSession = { ...mockSession, user: user({ walletAddress: TRON_ADDRESS }) };

    render(
      <LanguageProvider>
        <BindWalletPage />
      </LanguageProvider>,
    );

    expect(screen.getByTestId("bound-wallet-address").textContent).toBe(TRON_ADDRESS);
    expect(
      screen.getByText("This wallet address is already saved. Only support can change it."),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("bind-wallet-password")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter your USDT wallet address")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save wallet address/i }),
    ).not.toBeInTheDocument();
  });
});
