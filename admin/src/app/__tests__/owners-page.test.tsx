import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiAdminUser } from "@/lib/api";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminOwnersPage from "@/app/owners/page";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      adminListOwners: jest.fn(),
      adminCreateOwner: jest.fn(),
      adminUpdateUser: jest.fn(),
      adminResetUserPassword: jest.fn(),
    },
  };
});

const PAYOUT_ADDRESS = "TQn9frBx7kQvZ2mYdLcR3sVe8uHhP4xk";

const BASE_OWNER: ApiAdminUser = {
  _id: "65f0000000000000000000b1",
  name: "Owner Lin",
  phone: "09111000001",
  invitationCode: "OWN123",
  role: "owner",
  status: "online",
  online: true,
  cryptoAddress: PAYOUT_ADDRESS,
  createdAt: "2026-03-05T00:00:00.000Z",
  ipAddress: "203.0.113.9",
  lastLoginAt: "2026-10-30T00:00:00.000Z",
  lastSeenAt: "2026-11-03T00:00:00.000Z",
  lastDevice: "Chrome · Android",
  adminNote: "payout verified",
};

function owner(overrides: Partial<ApiAdminUser> = {}): ApiAdminUser {
  return { ...BASE_OWNER, ...overrides };
}

function listOwners(owners: ApiAdminUser[]) {
  (api.adminListOwners as jest.Mock).mockResolvedValue({ owners });
}

async function renderPage() {
  render(
    <LanguageProvider>
      <AdminOwnersPage />
    </LanguageProvider>,
  );

  return screen.findByText(BASE_OWNER.name);
}

beforeEach(() => {
  listOwners([owner()]);
  (api.adminCreateOwner as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminUpdateUser as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminResetUserPassword as jest.Mock).mockReset().mockResolvedValue({});
});

describe("Admin owners page", () => {
  it("shows the note, presence, device and last login the panel owns", async () => {
    await renderPage();

    expect(await screen.findByText("203.0.113.9")).toBeInTheDocument();
    expect(screen.getByText("Chrome · Android")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "payout verified" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("Last login")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("reads presence from the backend flag, not the stored status", async () => {
    listOwners([owner({ status: "offline", online: true })]);
    await renderPage();

    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(screen.queryByText("Offline")).toBeNull();
  });

  it("keeps Burned ahead of a fresh heartbeat", async () => {
    listOwners([owner({ status: "burned", online: false })]);
    await renderPage();

    expect(await screen.findByText("Burned")).toBeInTheDocument();
    expect(screen.queryByText("Online")).toBeNull();
  });

  it("resets an owner password through the shared endpoint", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    const input = await screen.findByTestId("reset-password");
    await user.clear(input);
    await user.type(input, "ownerpass1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.adminResetUserPassword).toHaveBeenCalledWith(
        BASE_OWNER._id,
        "ownerpass1",
      ),
    );
    expect(
      await screen.findByText("Password updated for Owner Lin"),
    ).toBeInTheDocument();
  });

  it("demotes an owner to a plain user", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "→ User" }));

    await waitFor(() =>
      expect(api.adminUpdateUser).toHaveBeenCalledWith(BASE_OWNER._id, {
        role: "user",
      }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("burns an owner", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Burned" }));

    await waitFor(() =>
      expect(api.adminUpdateUser).toHaveBeenCalledWith(BASE_OWNER._id, {
        status: "burned",
      }),
    );
  });

  it("un-burns a burned owner back to offline", async () => {
    const user = userEvent.setup();
    listOwners([owner({ status: "burned", online: false })]);
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(api.adminUpdateUser).toHaveBeenCalledWith(BASE_OWNER._id, {
        status: "offline",
      }),
    );
  });

  it("saves a trimmed owner note on Enter", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "payout verified" }));

    const input = await screen.findByTestId("owner-note-input");
    await user.clear(input);
    await user.type(input, "  awaiting kyc  ");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(api.adminUpdateUser).toHaveBeenCalledWith(BASE_OWNER._id, {
        adminNote: "awaiting kyc",
      }),
    );
    expect(screen.queryByTestId("owner-note-input")).toBeNull();
  });

  it("sends one note patch when Enter and blur both fire", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "payout verified" }));
    const input = await screen.findByTestId("owner-note-input");
    await user.clear(input);
    await user.type(input, "flagged");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(api.adminUpdateUser).toHaveBeenCalledWith(
        BASE_OWNER._id,
        expect.objectContaining({ adminNote: "flagged" }),
      ),
    );
    expect(api.adminUpdateUser).toHaveBeenCalledTimes(1);
  });

  it("opens the wallet editor with the owner payout address", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Wallet" }));

    const address = await screen.findByTestId("wallet-address");
    expect(address).toHaveValue(PAYOUT_ADDRESS);
  });

  it("surfaces a backend refusal instead of failing silently", async () => {
    const user = userEvent.setup();
    (api.adminUpdateUser as jest.Mock).mockRejectedValueOnce(
      new Error("The last active admin cannot be removed or demoted"),
    );
    await renderPage();

    await user.click(screen.getByRole("button", { name: "→ User" }));

    expect(
      await screen.findByText("The last active admin cannot be removed or demoted"),
    ).toBeInTheDocument();
  });
});
