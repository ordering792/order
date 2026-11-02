import { render, screen } from "@testing-library/react";
import AppShell from "@/app/components/AppShell";

const mockReplace = jest.fn();
let mockPathname = "/";
let mockAuth: { user: unknown; loading: boolean } = {
  user: null,
  loading: false,
};

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({ useAuth: () => mockAuth }));

jest.mock("@/app/components/Header", () => () => "header-stub");
jest.mock("@/app/components/BottomNav", () => () => "nav-stub");

function renderShell() {
  return render(
    <AppShell>
      <div>page-body</div>
    </AppShell>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = "/";
  mockAuth = { user: null, loading: false };
});

describe("AppShell agreement gate", () => {
  it("sends a signed-in user without acceptance to /license", () => {
    mockAuth = { user: { id: "u1", licenseAcceptedAt: null }, loading: false };

    renderShell();

    expect(mockReplace).toHaveBeenCalledWith("/license");
    expect(screen.queryByText("page-body")).not.toBeInTheDocument();
  });

  it("leaves /license itself alone so the agreement can be signed", () => {
    mockPathname = "/license";
    mockAuth = { user: { id: "u1", licenseAcceptedAt: null }, loading: false };

    renderShell();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("page-body")).toBeInTheDocument();
  });

  it("renders normally once the agreement is accepted", () => {
    mockAuth = {
      user: { id: "u1", licenseAcceptedAt: "2026-11-02T10:00:00.000Z" },
      loading: false,
    };

    renderShell();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("page-body")).toBeInTheDocument();
  });

  it("does not gate guests on the auth pages", () => {
    mockPathname = "/login";
    mockAuth = { user: null, loading: false };

    renderShell();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("page-body")).toBeInTheDocument();
  });
});
