import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n";
import RegisterPage from "@/app/register/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, register: jest.fn() }),
}));

jest.mock("@/lib/socket", () => ({ getSocket: () => null }));

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getStoredUser: () => null,
  api: {
    myConversations: jest
      .fn()
      .mockResolvedValue({ conversations: [{ _id: "conv-1" }] }),
    getConversation: jest.fn().mockResolvedValue({ messages: [] }),
  },
}));

function renderPage() {
  return render(
    <LanguageProvider>
      <RegisterPage />
    </LanguageProvider>,
  );
}

beforeAll(() => {
  // jsdom မှာ မရှိ — chat widget က message တစ်ချက်တိုင်း scroll ချတာ။
  Element.prototype.scrollIntoView = jest.fn();
});

describe("register page guest entry", () => {
  it("opens support as a guest from the header widget", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /customer service/i }),
    );

    expect(await screen.findByText(/chatting as a guest/i)).toBeInTheDocument();
  });

  it("drops the back arrow so /login is only the footer sign-in link", () => {
    renderPage();

    expect(screen.getAllByRole("link", { name: /sign in/i })).toHaveLength(1);
  });

  it("keeps the sign up form fields reachable", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/invitation/i)).toBeInTheDocument();
  });
});
