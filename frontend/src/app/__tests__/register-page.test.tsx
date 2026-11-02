import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n";
import RegisterPage from "@/app/register/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, register: jest.fn() }),
}));

function renderPage() {
  return render(
    <LanguageProvider>
      <RegisterPage />
    </LanguageProvider>,
  );
}

describe("register page guest entry", () => {
  it("opens support as a guest from the header", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /guest chat/i })).toHaveAttribute(
      "href",
      "/support",
    );
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
