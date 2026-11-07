import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n";
import { ApiError } from "@/lib/api";
import LoginPage from "@/app/login/page";

// client.ts က 401 မှာ session ကို ရှင်းလိုက်တဲ့အတွက် ဒီหน้ารဲ့ refusal ကို
// status (409) နဲ့ပဲ ရွေးတယ်။ ApiError ကို real class သုံးတယ် — page က
// `err instanceof ApiError` နဲ့ စစ်လို့ mock class မထည့်ချင်ဘူး။
const mockLogin = jest.fn();
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, login: mockLogin }),
}));

jest.mock("@/lib/socket", () => ({ getSocket: () => null }));

async function signIn() {
  render(
    <LanguageProvider>
      <LoginPage />
    </LanguageProvider>,
  );

  fireEvent.change(screen.getByPlaceholderText(/phone/i), {
    target: { value: "09123456789" },
  });
  fireEvent.change(screen.getByPlaceholderText(/password/i), {
    target: { value: "password123" },
  });
  // submit handler က async — error/isLoading setState တွေ act ထဲ ကျအောင်။
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  });
}

describe("customer login surface", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockPush.mockReset();
  });

  it("shows the panel-only copy for a 409 instead of the server text", async () => {
    mockLogin.mockRejectedValue(
      new ApiError(409, "This account signs in from the admin panel."),
    );

    await signIn();

    expect(
      await screen.findByText(/^This is a staff account/),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("passes a burned account through the server message", async () => {
    mockLogin.mockRejectedValue(
      new ApiError(403, "This account has been deactivated."),
    );

    await signIn();

    expect(await screen.findByText(/deactivated/)).toBeInTheDocument();
  });

  it("routes a signed-in customer by the license flag", async () => {
    mockLogin.mockResolvedValue({ licenseAcceptedAt: null });

    await signIn();

    expect(mockPush).toHaveBeenCalledWith("/license");
  });
});
