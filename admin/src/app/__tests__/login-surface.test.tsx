import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n";
import AdminLoginPage from "@/app/login/page";

// fetch ကို အတိုးလှိုက် mock လုပ်တယ် — client.ts ရဲ့ ApiError (status သယ်) ကို
// အစစ်အမှန် ရအောင်။ 409 branch ကို စစ်ဖို့ ဒါက အတိုဆုံး လမ်း။
const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    refreshUser: mockRefreshUser,
  }),
}));

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: new Headers({ "Content-Type": "application/json" }),
  } as Response;
}

async function signIn() {
  render(
    <LanguageProvider>
      <AdminLoginPage />
    </LanguageProvider>,
  );

  fireEvent.change(screen.getByPlaceholderText(/phone number/i), {
    target: { value: "09123456789" },
  });
  fireEvent.change(screen.getByPlaceholderText(/^password$/i), {
    target: { value: "password123" },
  });

  // submit handler က async — error setState တွေ act ထဲ ကျအောင်။
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  });
}

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
  mockReplace.mockReset();
});

describe("panel login surface", () => {
  it("posts to /auth/staff-login and keeps the session on success", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "panel-token", user: { id: "a1", role: "admin" } }),
    );

    await signIn();

    expect(mockFetch.mock.calls[0][0]).toContain("/auth/staff-login");
    expect(localStorage.getItem("token")).toBe("panel-token");
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("shows the panel refusal copy for a 409, not the server text", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "This account signs in from the customer app." }, 409),
    );

    await signIn();

    expect(
      screen.getByText(/no admin or owner access/i),
    ).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("passes a burned staff account through the server message", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "This account has been deactivated." }, 403),
    );

    await signIn();

    expect(screen.getByText(/deactivated/)).toBeInTheDocument();
  });

  it("keeps the wrong-password message untouched", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Invalid phone or password" }, 401),
    );

    await signIn();

    expect(screen.getByText("Invalid phone or password")).toBeInTheDocument();
  });
});
