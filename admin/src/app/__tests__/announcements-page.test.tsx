import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiAdminUser, ApiAnnouncement } from "@/lib/api";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminAnnouncementsPage from "@/app/announcements/page";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      adminListAnnouncements: jest.fn(),
      adminCreateAnnouncement: jest.fn(),
      adminListUsers: jest.fn(),
    },
  };
});

const BROADCAST: ApiAnnouncement = {
  _id: "65f0000000000000000000b1",
  title: "Maintenance tonight",
  content: "Server restart at 02:00.",
  createdAt: "2026-11-03T00:00:00.000Z",
  userId: { name: "Panel" },
  recipientId: null,
};

const PERSONAL: ApiAnnouncement = {
  _id: "65f0000000000000000000b2",
  title: "Your deposit",
  content: "We credited 50,000 ks.",
  createdAt: "2026-11-02T00:00:00.000Z",
  userId: { name: "Panel" },
  recipientId: { name: "Ko Ko", phone: "0912345678" },
};

function candidate(overrides: Partial<ApiAdminUser> = {}): ApiAdminUser {
  return {
    _id: "65f0000000000000000000a1",
    name: "Ko Ko",
    phone: "0912345678",
    invitationCode: "AB12CD",
    role: "user",
    status: "online",
    online: true,
    balance: "125.50",
    ...overrides,
  } as ApiAdminUser;
}

function mockAnnouncements(announcements: ApiAnnouncement[]) {
  (api.adminListAnnouncements as jest.Mock).mockResolvedValue({
    announcements,
  });
}

function mockUsers(users: ApiAdminUser[]) {
  (api.adminListUsers as jest.Mock).mockResolvedValue({
    users,
    total: users.length,
    page: 1,
    pages: 1,
    counts: { all: users.length, online: 0, offline: 0, burned: 0 },
  });
}

beforeEach(() => {
  jest.useRealTimers();
  mockAnnouncements([BROADCAST, PERSONAL]);
  mockUsers([candidate()]);
  (api.adminCreateAnnouncement as jest.Mock)
    .mockReset()
    .mockResolvedValue({ announcement: BROADCAST });
});

describe("Announcements audience filter", () => {
  it("lists both audiences by default and shows the recipient chip", async () => {
    render(
      <LanguageProvider>
        <AdminAnnouncementsPage />
      </LanguageProvider>,
    );

    await screen.findByText("Maintenance tonight");

    expect(api.adminListAnnouncements).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId("audience-chip-all")).toHaveTextContent(
      "All users",
    );
    expect(screen.getByTestId("audience-chip-personal")).toHaveTextContent(
      "Ko Ko",
    );
  });

  it("reloads with the chosen audience", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <AdminAnnouncementsPage />
      </LanguageProvider>,
    );

    await screen.findByText("Maintenance tonight");
    (api.adminListAnnouncements as jest.Mock).mockClear();

    await user.selectOptions(screen.getByTestId("audience-filter"), "personal");

    await waitFor(() =>
      expect(api.adminListAnnouncements).toHaveBeenCalledWith("personal"),
    );

    await user.selectOptions(screen.getByTestId("audience-filter"), "all");

    await waitFor(() =>
      expect(api.adminListAnnouncements).toHaveBeenCalledWith("all"),
    );
  });
});

describe("Announcements compose", () => {
  it("sends a broadcast without a recipient", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <AdminAnnouncementsPage />
      </LanguageProvider>,
    );

    await screen.findByText("Maintenance tonight");

    await user.type(
      screen.getByLabelText("Title"),
      "Bonus live",
    );
    await user.type(screen.getByLabelText("Message"), "Claims open now");

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeEnabled();

    await user.click(send);

    await waitFor(() =>
      expect(api.adminCreateAnnouncement).toHaveBeenCalledWith({
        title: "Bonus live",
        content: "Claims open now",
        recipientId: null,
      }),
    );
  });

  it("blocks a personal send until the searched user is picked", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <AdminAnnouncementsPage />
      </LanguageProvider>,
    );

    await screen.findByText("Maintenance tonight");

    await user.click(screen.getByTestId("audience-tile-one"));
    await user.type(screen.getByLabelText("Title"), "Round note");
    await user.type(screen.getByLabelText("Message"), "Check your plan.");

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    expect(api.adminListUsers).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText("Search"), "Ko");

    await waitFor(() =>
      expect(api.adminListUsers).toHaveBeenCalledWith({
        search: "Ko",
        limit: 5,
      }),
    );

    const picked = await screen.findByTestId(
      "recipient-result-65f0000000000000000000a1",
    );
    expect(picked).toHaveTextContent("Ko Ko");
    expect(picked).toHaveTextContent("0912345678 · AB12CD");

    await user.click(picked);

    expect(send).toBeEnabled();

    await user.click(send);

    await waitFor(() =>
      expect(api.adminCreateAnnouncement).toHaveBeenCalledWith({
        title: "Round note",
        content: "Check your plan.",
        recipientId: "65f0000000000000000000a1",
      }),
    );
  });

  it("clears the picked recipient when switching back to all users", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <AdminAnnouncementsPage />
      </LanguageProvider>,
    );

    await screen.findByText("Maintenance tonight");

    await user.click(screen.getByTestId("audience-tile-one"));
    await user.type(screen.getByPlaceholderText("Search"), "Ko");

    const picked = await screen.findByTestId(
      "recipient-result-65f0000000000000000000a1",
    );
    await user.click(picked);

    expect(
      await screen.findByTestId("audience-tile-one"),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByTestId("recipient-clear"));

    expect(screen.queryByText("AB12CD")).toBeNull();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });
});
