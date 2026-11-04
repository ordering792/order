import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiAdminUser, ApiUserCounts } from "@/lib/api";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminUsersPage from "@/app/users/page";

type PanelUser = { _id: string; name: string; role: ApiAdminUser["role"] };

declare global {
  var __adminUser: PanelUser | null;
}

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      adminListUsers: jest.fn(),
      adminUpdateUser: jest.fn(),
      adminResetUserPassword: jest.fn(),
      adminAdjustBalance: jest.fn(),
      adminUpdateUserWalletAddress: jest.fn(),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: globalThis.__adminUser }),
}));

const BASE_ROW: ApiAdminUser = {
  _id: "65f0000000000000000000a1",
  name: "Ko Ko",
  phone: "0912345678",
  invitationCode: "AB12CD",
  role: "user",
  status: "online",
  online: true,
  balance: "125.50",
  walletAddress: "TQn9frBx7kQvZ2mYdLcR3sVe8uHhP4xk",
  createdAt: "2026-03-05T00:00:00.000Z",
  ipAddress: "203.0.113.42",
  lastLoginAt: "2026-10-30T00:00:00.000Z",
  lastSeenAt: "2026-11-03T00:00:00.000Z",
  lastDevice: "Chrome · Windows",
};

function row(overrides: Partial<ApiAdminUser> = {}): ApiAdminUser {
  return { ...BASE_ROW, ...overrides };
}

// T + base58 ၃၃ လုံး = ၃၄ လုံး (backend TRON_ADDRESS အတိုင်း)။
const NEW_ADDRESS = "TQSVhFzR7pN3yKdLmXcBv8tGnWqJs4Yp2r";

// Count tile တွေ ဖတ်တဲ့ scope counts။ `total` (filtered rows) နဲ့ သေချာ မတူအောင်
// 40/7/30/3 — tile က counts ကိုပဲ ဖတ်တယ်၊ row count ကို မဟုတ်ဘူး။
const ALL_COUNTS: ApiUserCounts = { all: 40, online: 7, offline: 30, burned: 3 };

function listUsers(users: ApiAdminUser[], counts = ALL_COUNTS) {
  (api.adminListUsers as jest.Mock).mockResolvedValue({
    users,
    total: users.length,
    pages: 1,
    counts,
  });
}

async function renderPage(role: PanelUser["role"] = "admin") {
  globalThis.__adminUser = { _id: "admin-id", name: "Panel", role };
  render(
    <LanguageProvider>
      <AdminUsersPage />
    </LanguageProvider>,
  );

  return screen.findByText(BASE_ROW.invitationCode);
}

beforeEach(() => {
  globalThis.__adminUser = null;
  listUsers([row()]);
  (api.adminUpdateUser as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminResetUserPassword as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminAdjustBalance as jest.Mock)
    .mockReset()
    .mockResolvedValue({ balance: "135.50" });
  (api.adminUpdateUserWalletAddress as jest.Mock).mockReset().mockResolvedValue({
    message: "Wallet address updated",
    walletAddress: NEW_ADDRESS,
  });
});

describe("Admin users page", () => {
  it("shows wallet, device and last login values for admins", async () => {
    await renderPage();

    expect(await screen.findByText("TQn9frBx…P4xk")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.42")).toBeInTheDocument();
    expect(screen.getByText("Chrome · Windows")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("labels the column by last login, not by join date", async () => {
    await renderPage();

    expect(screen.getByText("Last login")).toBeInTheDocument();
    expect(screen.queryByText("Joined")).toBeNull();

    const cell = screen.getByTitle(new Date(BASE_ROW.lastLoginAt!).toLocaleString());
    // createdAt (2026-03-05) must not leak into the row.
    expect(cell.textContent).toContain("10/30/2026");
    expect(cell.textContent).not.toContain("3/5/2026");
  });

  it("shows a placeholder for a user who has never signed in", async () => {
    listUsers([row({ lastLoginAt: null })]);
    await renderPage();

    expect(await screen.findByText(BASE_ROW.invitationCode)).toBeInTheDocument();
    expect(
      screen.queryByTitle(new Date(BASE_ROW.lastLoginAt!).toLocaleString()),
    ).toBeNull();
  });

  describe("presence column", () => {
    // STATUS filter ထဲက <option> တွေက badge အမည်တွေနဲ့ တစ်ပုံစံတည်းဖြစ်လို့
    // query တွေကို row ထဲပဲ ကျဉ်းရမယ်။
    async function renderRow(user: ApiAdminUser) {
      listUsers([user]);
      const code = await renderPage();
      const tr = code.closest("tr");
      if (!tr) throw new Error("user row is missing");

      return within(tr);
    }

    it("reads the derived flag, not the stored status", async () => {
      const cells = await renderRow(row({ status: "online", online: false }));

      expect(cells.getByText("Offline")).toBeInTheDocument();
      expect(cells.queryByText("Online")).toBeNull();
    });

    it("shows Online for a stale status=offline account the backend stamped", async () => {
      const cells = await renderRow(row({ status: "offline", online: true }));

      expect(cells.getByText("Online")).toBeInTheDocument();
    });

    it("keeps Burned ahead of presence", async () => {
      const cells = await renderRow(row({ status: "burned", online: true }));

      expect(cells.getByText("Burned")).toBeInTheDocument();
      expect(cells.queryByText("Online")).toBeNull();
    });

    it("reveals the last seen time on hover", async () => {
      const cells = await renderRow(row());

      expect(cells.getByText("Online").getAttribute("title")).toMatch(
        /^Last seen /,
      );
    });

    it("has no tooltip for an account that was never seen", async () => {
      const cells = await renderRow(row({ online: false, lastSeenAt: null }));

      expect(cells.getByText("Offline")).toBeInTheDocument();
      expect(cells.queryByTitle(/^Last seen /)).toBeNull();
    });
  });

  describe("count tiles", () => {
    // Tile အမည်တွေ (Online/Offline/Burned) က status dropdown နဲ့ row badge တွေမှာ
    // ပါတူတယ် — ဒါကြောင့် testid နဲ့ပဲ ရှာတယ်။
    async function renderWithCounts(counts = ALL_COUNTS) {
      listUsers([row()], counts);
      await renderPage();
      return screen.findByTestId("count-tile-all");
    }

    it("shows the scope counts the backend sent", async () => {
      await renderWithCounts();

      expect(screen.getByTestId("count-tile-all")).toHaveTextContent("40");
      expect(screen.getByTestId("count-tile-online")).toHaveTextContent("7");
      expect(screen.getByTestId("count-tile-offline")).toHaveTextContent("30");
      expect(screen.getByTestId("count-tile-burned")).toHaveTextContent("3");
    });

    it("presses a tile to filter the table by that status", async () => {
      const user = userEvent.setup();
      await renderWithCounts();

      await user.click(screen.getByTestId("count-tile-burned"));

      await waitFor(() =>
        expect(api.adminListUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: "burned", page: 1 }),
        ),
      );
      expect(screen.getByTestId("count-tile-burned")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("count-tile-all")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("keeps the breakdown while a status filter narrows the rows", async () => {
      const user = userEvent.setup();
      await renderWithCounts();

      await user.click(screen.getByTestId("count-tile-online"));

      // total = 1 filtered row ဒါပေမဲ့ tile က counts (40/7/30/3) ကိုပဲ ပြရမယ်။
      expect(await screen.findByTestId("count-tile-all")).toHaveTextContent("40");
      expect(screen.getByTestId("count-tile-offline")).toHaveTextContent("30");
    });

    it("releases the active tile back to the unfiltered scope", async () => {
      const user = userEvent.setup();
      await renderWithCounts();

      await user.click(screen.getByTestId("count-tile-offline"));
      await waitFor(() =>
        expect(api.adminListUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: "offline" }),
        ),
      );

      await user.click(screen.getByTestId("count-tile-offline"));
      await waitFor(() =>
        expect(api.adminListUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: undefined }),
        ),
      );
      expect(screen.getByTestId("count-tile-all")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("treats an empty scope as zeros instead of blanks", async () => {
      await renderWithCounts({ all: 0, online: 0, offline: 0, burned: 0 });

      expect(screen.getByTestId("count-tile-all")).toHaveTextContent("0");
      expect(screen.getByTestId("count-tile-burned")).toHaveTextContent("0");
    });
  });

  it("never renders a stored password, only a reset control", async () => {
    await renderPage();

    expect(screen.getByText("••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("gives owners the reset control but keeps the rest admin-only", async () => {
    await renderPage("owner");

    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.queryByText("Actions")).toBeNull();
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("hides the reset control from an owner on his own row", async () => {
    listUsers([row({ role: "owner", name: "Panel Owner" })]);
    await renderPage("owner");

    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("lets an owner reset a downline user's password", async () => {
    const user = userEvent.setup();
    await renderPage("owner");

    await user.click(screen.getByRole("button", { name: "Reset" }));

    const input = await screen.findByTestId("reset-password");
    await user.clear(input);
    await user.type(input, "ownerpass1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.adminResetUserPassword).toHaveBeenCalledWith(
        BASE_ROW._id,
        "ownerpass1",
      ),
    );
    expect(
      await screen.findByText("Password updated for Ko Ko"),
    ).toBeInTheDocument();
  });

  it("refuses to reset an admin account from the panel", async () => {
    listUsers([row({ role: "admin", name: "Peer Admin" })]);
    await renderPage();

    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("resets a password with the typed value and confirms", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    const input = await screen.findByTestId("reset-password");
    await user.clear(input);
    await user.type(input, "mynewpass");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.adminResetUserPassword).toHaveBeenCalledWith(
        BASE_ROW._id,
        "mynewpass",
      ),
    );
    expect(
      await screen.findByText("Password updated for Ko Ko"),
    ).toBeInTheDocument();

    // The generated password is only recoverable while this modal stays open.
    expect(screen.getByTestId("reset-password")).toHaveValue("mynewpass");
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("previews a credit and sends the cent-exact amount", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "+" }));

    await user.type(await screen.findByTestId("adjust-amount"), "10.00");
    await user.type(screen.getByPlaceholderText(/refund/i), "duplicate deposit");

    expect(await screen.findByText(/→ \$135\.50/)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Save" });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(api.adminAdjustBalance).toHaveBeenCalledWith(BASE_ROW._id, {
        type: "credit",
        amount: "10.00",
        reason: "duplicate deposit",
      }),
    );
    expect(
      await screen.findByText("Balance updated for Ko Ko"),
    ).toBeInTheDocument();
  });

  it("opens the debit modal already switched to decrease", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "−" }));
    await user.type(await screen.findByTestId("adjust-amount"), "5.00");

    expect(await screen.findByText(/→ \$120\.50/)).toBeInTheDocument();
  });

  it("blocks a debit larger than the balance before calling the api", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "−" }));
    await user.type(await screen.findByTestId("adjust-amount"), "500.00");

    expect(screen.getByText("→ $-374.50")).toBeInTheDocument();
    expect(
      screen.getByText("Deduction is larger than the balance"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(api.adminAdjustBalance).not.toHaveBeenCalled();
  });

  it("surfaces a backend rejection instead of closing the modal", async () => {
    const user = userEvent.setup();
    await renderPage();

    (api.adminAdjustBalance as jest.Mock).mockRejectedValueOnce(
      new Error("Insufficient balance"),
    );

    await user.click(screen.getByRole("button", { name: "−" }));
    await user.type(await screen.findByTestId("adjust-amount"), "5.00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Insufficient balance")).toBeInTheDocument();
    expect(screen.getByTestId("adjust-amount")).toBeInTheDocument();
  });

  it("sends a trimmed TRC20 address and confirms the change", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Change" }));

    const input = await screen.findByTestId("wallet-address-input");
    expect(screen.queryByTestId("wallet-password-input")).toBeNull();
    await user.type(input, `  ${NEW_ADDRESS}  `);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.adminUpdateUserWalletAddress).toHaveBeenCalledWith(
        BASE_ROW._id,
        NEW_ADDRESS,
        undefined,
      ),
    );
    expect(
      await screen.findByText("Wallet address updated for Ko Ko"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-address-input")).toBeNull();
  });

  it("shows the stored address and keeps save disabled until the format is right", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Change" }));

    expect(
      await screen.findByText(/Current/i),
    ).toBeInTheDocument();

    const input = screen.getByTestId("wallet-address-input");
    await user.type(input, "0xABCDEF0123456789abcdef0123456789abcdef");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(api.adminUpdateUserWalletAddress).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, NEW_ADDRESS);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps the modal open when a pending withdrawal blocks the change", async () => {
    const user = userEvent.setup();
    await renderPage();

    (api.adminUpdateUserWalletAddress as jest.Mock).mockRejectedValueOnce(
      new Error("Resolve the pending withdrawal before changing the wallet address"),
    );

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.type(await screen.findByTestId("wallet-address-input"), NEW_ADDRESS);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/pending withdrawal/i)).toBeInTheDocument();
    expect(screen.getByTestId("wallet-address-input")).toHaveValue(NEW_ADDRESS);
    expect(screen.queryByText("Wallet address updated for Ko Ko")).toBeNull();
  });

  it("asks for the login password on an owner row and sends it", async () => {
    const user = userEvent.setup();
    listUsers([row({ role: "owner", name: "Owner Lin" })]);
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Change" }));

    await user.type(
      await screen.findByTestId("wallet-address-input"),
      NEW_ADDRESS,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(screen.getByTestId("wallet-password-input"), "admin123456");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.adminUpdateUserWalletAddress).toHaveBeenCalledWith(
        BASE_ROW._id,
        NEW_ADDRESS,
        "admin123456",
      ),
    );
  });

  it("keeps the typed password when the server says it is wrong", async () => {
    const user = userEvent.setup();
    listUsers([row({ role: "owner", name: "Owner Lin" })]);
    (api.adminUpdateUserWalletAddress as jest.Mock).mockRejectedValueOnce(
      new Error("Incorrect password"),
    );
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.type(await screen.findByTestId("wallet-address-input"), NEW_ADDRESS);
    await user.type(screen.getByTestId("wallet-password-input"), "old123456");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-address-input")).toHaveValue(NEW_ADDRESS);
    expect(screen.getByTestId("wallet-password-input")).toHaveValue("old123456");
  });

  it("hides the wallet change control from an admin row", async () => {
    listUsers([row({ role: "admin", name: "Peer Admin" })]);
    await renderPage();

    expect(await screen.findByText("Peer Admin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("hides the wallet change control from owners", async () => {
    await renderPage("owner");

    expect(await screen.findByText(BASE_ROW.invitationCode)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  describe("admin note column", () => {
    it("shows the note control to admins only", async () => {
      await renderPage();

      expect(await screen.findByText("Note")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
    });

    it("hides the note column and its data from owners", async () => {
      // Backend never sends adminNote to an owner; the UI must not offer the column.
      listUsers([row({ adminNote: "private marker" })]);
      await renderPage("owner");

      expect(await screen.findByText(BASE_ROW.invitationCode)).toBeInTheDocument();
      expect(screen.queryByText("Note")).toBeNull();
      expect(screen.queryByText("private marker")).toBeNull();
    });

    it("renders the stored note in the cell", async () => {
      listUsers([row({ adminNote: "deposit proof looks edited" })]);
      await renderPage();

      expect(
        await screen.findByRole("button", {
          name: "deposit proof looks edited",
        }),
      ).toBeInTheDocument();
    });

    it("saves a trimmed note on Enter and confirms", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole("button", { name: "Add note" }));

      const input = await screen.findByTestId("note-input");
      await user.type(input, "  late withdrawal  ");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(api.adminUpdateUser).toHaveBeenCalledWith(BASE_ROW._id, {
          adminNote: "late withdrawal",
        }),
      );
      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(screen.queryByTestId("note-input")).toBeNull();
    });

    it("clears the note with null when the cell is emptied", async () => {
      const user = userEvent.setup();
      listUsers([row({ adminNote: "old marker" })]);
      await renderPage();

      await user.click(screen.getByRole("button", { name: "old marker" }));

      const input = await screen.findByTestId("note-input");
      await user.clear(input);
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(api.adminUpdateUser).toHaveBeenCalledWith(BASE_ROW._id, {
          adminNote: null,
        }),
      );
    });

    it("sends one patch when Enter and blur both fire", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole("button", { name: "Add note" }));
      await user.type(await screen.findByTestId("note-input"), "flagged");
      await user.keyboard("{Enter}");

      await waitFor(() => expect(api.adminUpdateUser).toHaveBeenCalledTimes(1));
    });

    it("skips the patch when nothing changed", async () => {
      const user = userEvent.setup();
      listUsers([row({ adminNote: "same text" })]);
      await renderPage();

      await user.click(screen.getByRole("button", { name: "same text" }));
      await user.keyboard("{Escape}");

      expect(screen.queryByTestId("note-input")).toBeNull();
      expect(api.adminUpdateUser).not.toHaveBeenCalled();
    });

    it("keeps the typed text when the backend rejects the note", async () => {
      const user = userEvent.setup();
      await renderPage();

      (api.adminUpdateUser as jest.Mock).mockRejectedValueOnce(
        new Error("Validation failed"),
      );

      await user.click(screen.getByRole("button", { name: "Add note" }));
      await user.type(await screen.findByTestId("note-input"), "too long marker");
      await user.keyboard("{Enter}");

      expect(await screen.findByText("Validation failed")).toBeInTheDocument();
      expect(screen.getByTestId("note-input")).toHaveValue("too long marker");
    });
  });
});
