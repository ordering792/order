import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminSupportPage from "@/app/support/page";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      adminListConversations: jest.fn(),
      adminGetConversation: jest.fn(),
      adminMarkConversationRead: jest.fn(),
      adminSendMessage: jest.fn(),
      adminCloseConversation: jest.fn(),
      adminReopenConversation: jest.fn(),
      adminDeleteConversation: jest.fn(),
    },
  };
});

// Socket ကို fake လုပ်တယ် — getSocket() က render အပြီးမှာ ခေါ်လို့
// module-scope const တွေ safety ရှိတယ် (factory body မှာ မထိဘူး)။
const mockSocketListeners: Record<string, (payload?: unknown) => void> = {};
const mockSocketEmit = jest.fn();

jest.mock("@/lib/socket", () => ({
  getSocket: () => ({
    connected: true,
    on: (event: string, fn: (payload?: unknown) => void) => {
      mockSocketListeners[event] = fn;
    },
    off: (event: string) => {
      delete mockSocketListeners[event];
    },
    emit: mockSocketEmit,
  }),
}));

type Conversation = {
  _id: string;
  subject?: string;
  status?: string;
  lastMessagePreview?: string;
  guestId?: string | null;
  userId?: { name: string; phone: string } | null;
  unreadCountByAdmin?: number;
};

const USER_CONV: Conversation = {
  _id: "65f0000000000000000000c1",
  subject: "General Support",
  status: "open",
  guestId: null,
  userId: { name: "Ko Ko", phone: "0912345678" },
  lastMessagePreview: "deposit stuck",
};

const GUEST_CONV: Conversation = {
  _id: "65f0000000000000000000c2",
  subject: "General Support",
  status: "open",
  guestId: "123e4567e89b12d3a456426614174000",
  userId: null,
  lastMessagePreview: "hi",
};

function list(conversations: Conversation[]) {
  (api.adminListConversations as jest.Mock).mockResolvedValue({
    conversations,
    total: conversations.length,
    counts: {
      all: conversations.length,
      users: conversations.filter((c) => c.userId).length,
      guests: conversations.filter((c) => !c.userId).length,
    },
  });
}

async function renderPage() {
  render(
    <LanguageProvider>
      <AdminSupportPage />
    </LanguageProvider>,
  );

  return screen.findByTestId("support-search");
}

beforeEach(() => {
  list([USER_CONV, GUEST_CONV]);
  (api.adminGetConversation as jest.Mock).mockResolvedValue({
    conversation: USER_CONV,
    messages: [],
  });
  (api.adminMarkConversationRead as jest.Mock)
    .mockReset()
    .mockResolvedValue({ conversation: USER_CONV });
  (api.adminReopenConversation as jest.Mock)
    .mockReset()
    .mockResolvedValue({ conversation: USER_CONV });
  (api.adminDeleteConversation as jest.Mock)
    .mockReset()
    .mockResolvedValue({ message: "Conversation deleted" });
  (api.adminListConversations as jest.Mock).mockClear();
  mockSocketEmit.mockClear();
  for (const event of Object.keys(mockSocketListeners)) {
    delete mockSocketListeners[event];
  }
});

describe("Admin support page", () => {
  it("leads with the customer name, not the subject", async () => {
    await renderPage();

    const name = await screen.findByText("Ko Ko");
    const row = name.closest("button");
    expect(row?.textContent).toContain("0912345678");
    expect(row?.textContent).toContain("General Support");
    expect(row?.textContent).toContain("open");
  });

  it("labels a conversation without an account as Guest with a short id", async () => {
    await renderPage();

    expect(await screen.findByText("Guest · 123e4567…")).toBeInTheDocument();
    // The raw 32-char id must not be dumped into the row.
    expect(screen.queryByText(/123e4567e89b/)).toBeNull();
  });

  it("shows the same identity in the open conversation header", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByText("Guest · 123e4567…"));

    const header = await screen.findByTestId("support-header");
    expect(header.textContent).toContain("Guest · 123e4567…");
    expect(header.textContent).toContain("General Support");
  });

  it("searches by the typed text after a short pause", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByTestId("support-search"), "0912345678");

    await waitFor(() =>
      expect(api.adminListConversations).toHaveBeenCalledWith({
        search: "0912345678",
        participant: undefined,
      }),
    );
  });

  it("loads everything when the search box is empty", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(await screen.findByTestId("support-search"), "abc");
    await user.clear(screen.getByTestId("support-search"));

    await waitFor(() =>
      expect(api.adminListConversations).toHaveBeenLastCalledWith({
        search: undefined,
        participant: undefined,
      }),
    );
  });

  describe("unread badge and participant tabs", () => {
    it("marks a conversation read as soon as it is opened", async () => {
      const user = userEvent.setup();
      list([{ ...USER_CONV, unreadCountByAdmin: 3 }, GUEST_CONV]);
      await renderPage();

      await user.click(await screen.findByText("Ko Ko"));

      await waitFor(() =>
        expect(api.adminMarkConversationRead).toHaveBeenCalledWith(
          USER_CONV._id,
        ),
      );
      // Optimistic clear — poll အဖြေကို မစောင့်ဘူး။
      expect(await screen.findByText("Guest · 123e4567…")).toBeInTheDocument();
      expect(screen.queryByTestId("unread-badge")).toBeNull();
    });

    it("shows the unread count beside a bold name and dims read rows", async () => {
      list([{ ...USER_CONV, unreadCountByAdmin: 3 }, GUEST_CONV]);
      await renderPage();

      expect(await screen.findByTestId("unread-badge")).toHaveTextContent("3");
      expect(screen.getAllByTestId("unread-dot")).toHaveLength(1);
      expect(screen.getByText("Ko Ko").className).toContain("font-bold");
      expect(screen.getByText("Guest · 123e4567…").className).toContain(
        "font-medium",
      );
    });

    it("caps a large unread count instead of breaking the row", async () => {
      list([{ ...USER_CONV, unreadCountByAdmin: 240 }]);
      await renderPage();

      expect(await screen.findByTestId("unread-badge")).toHaveTextContent("99+");
    });

    it("never calls the read endpoint for an already-read conversation", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");

      expect(api.adminMarkConversationRead).not.toHaveBeenCalled();
    });

    it("asks the api for guest conversations only on the Guests tab", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByTestId("support-tab-guests"));

      await waitFor(() =>
        expect(api.adminListConversations).toHaveBeenLastCalledWith({
          search: undefined,
          participant: "guests",
        }),
      );
    });

    it("prints one conversation count per tab", async () => {
      await renderPage();

      expect(await screen.findByTestId("support-tab-all")).toHaveTextContent("2");
      expect(screen.getByTestId("support-tab-users")).toHaveTextContent("1");
      expect(screen.getByTestId("support-tab-guests")).toHaveTextContent("1");
    });
  });

  describe("live chat screen", () => {
    async function openUserConversation() {
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");
    }

    function pushMessage(payload: unknown) {
      act(() => {
        mockSocketListeners["message:new"](payload);
      });
    }

    function pushUpdated(conversationId: string) {
      act(() => {
        mockSocketListeners["conversation:updated"]({ conversationId });
      });
    }

    // jsdom က "visible" ပေးတာမို့ tab နောက်မှာထားတဲ့ အခြေအနေကို ကိုယ်တိုင် တပ်တယ်။
    function withVisibility(state: string, run: () => Promise<void>) {
      const original = Object.getOwnPropertyDescriptor(document, "visibilityState");
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });

      return run().finally(() => {
        if (original) {
          Object.defineProperty(document, "visibilityState", original);
        }
      });
    }

    it("clears the badge that a live message re-opened", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");
      expect(api.adminMarkConversationRead).not.toHaveBeenCalled();

      // Guest စာပို့ → poll က backend အမှန် unread 2 ကို ပြန်ပေးတယ်။
      list([{ ...USER_CONV, unreadCountByAdmin: 2 }, GUEST_CONV]);
      pushUpdated(USER_CONV._id);

      await waitFor(() =>
        expect(api.adminMarkConversationRead).toHaveBeenCalledWith(USER_CONV._id),
      );
      await waitFor(() =>
        expect(screen.queryByTestId("unread-badge")).toBeNull(),
      );
    });

    it("leaves the badge counting up while the tab is hidden", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");

      return withVisibility("hidden", async () => {
        list([{ ...USER_CONV, unreadCountByAdmin: 2 }, GUEST_CONV]);
        pushUpdated(USER_CONV._id);

        await screen.findByTestId("unread-badge");
        expect(api.adminMarkConversationRead).not.toHaveBeenCalled();
      });
    });

    it("does not mark another conversation read when it updates", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");

      list([{ ...USER_CONV, unreadCountByAdmin: 2 }, GUEST_CONV]);
      pushUpdated(GUEST_CONV._id);

      // ဒီ event က ဖွင့်ထားတဲ့ conversation မဟုတ်လို့ refresh ပဲဖြစ်ပြီး
      // ဖတ်ပြီး လက်မှတ် မရေးဘူး — badge က ဆက်နေမယ်။
      await screen.findByTestId("unread-badge");
      expect(api.adminMarkConversationRead).not.toHaveBeenCalled();
    });

    it("joins the conversation room as soon as it is opened", async () => {
      await openUserConversation();

      expect(mockSocketEmit).toHaveBeenCalledWith(
        "conversation:join",
        USER_CONV._id,
        expect.any(Function),
      );
    });

    it("prints an incoming message without another click", async () => {
      await openUserConversation();

      pushMessage({
        conversationId: USER_CONV._id,
        message: {
          _id: "m-1",
          senderType: "customer",
          body: "my deposit is stuck",
          createdAt: "2026-11-02T10:00:00.000Z",
        },
      });

      expect(await screen.findByText("my deposit is stuck")).toBeInTheDocument();

      // conversation:updated fallback refetch နဲ့ ထပ်ကျရင် တစ်ခုပဲ ပြမယ်။
      pushMessage({
        conversationId: USER_CONV._id,
        message: {
          _id: "m-1",
          senderType: "customer",
          body: "my deposit is stuck",
          createdAt: "2026-11-02T10:00:00.000Z",
        },
      });

      expect(screen.getAllByText("my deposit is stuck")).toHaveLength(1);
    });

    it("leaves a message from another conversation out of the panel", async () => {
      await openUserConversation();

      pushMessage({
        conversationId: GUEST_CONV._id,
        message: {
          _id: "m-9",
          senderType: "customer",
          body: "other thread",
          createdAt: "2026-11-02T10:00:00.000Z",
        },
      });

      expect(screen.queryByText("other thread")).not.toBeInTheDocument();
    });

    it("leaves the room when a different conversation is opened", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");
      await user.click(await screen.findByText("Guest · 123e4567…"));

      expect(mockSocketEmit).toHaveBeenCalledWith(
        "conversation:leave",
        USER_CONV._id,
      );
      expect(mockSocketEmit).toHaveBeenLastCalledWith(
        "conversation:join",
        GUEST_CONV._id,
        expect.any(Function),
      );
    });
  });

  describe("closing and reopening", () => {
    const CLOSED_CONV: Conversation = { ...USER_CONV, status: "closed" };

    async function openClosedConversation() {
      const user = userEvent.setup();
      list([CLOSED_CONV, GUEST_CONV]);
      (api.adminGetConversation as jest.Mock).mockResolvedValue({
        conversation: CLOSED_CONV,
        messages: [],
      });
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-reopen");
      return user;
    }

    it("keeps Reject on a conversation that is still open", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-close");

      expect(screen.queryByTestId("support-reopen")).toBeNull();
      expect(screen.getByTestId("support-reply")).toBeEnabled();
    });

    it("offers Reopen in place of Reject once it is closed", async () => {
      await openClosedConversation();

      expect(screen.queryByTestId("support-close")).toBeNull();
    });

    it("locks the reply box while the conversation is closed", async () => {
      await openClosedConversation();

      // backend က closed conversation ဆီ စာပို့ရင် 409 ပြန်ပေးလို့ box ကို ပိတ်ထားတယ်။
      expect(screen.getByTestId("support-reply")).toBeDisabled();
    });

    it("posts the reopen and pulls a fresh list", async () => {
      const user = await openClosedConversation();
      list([USER_CONV, GUEST_CONV]);

      await user.click(screen.getByTestId("support-reopen"));

      await waitFor(() =>
        expect(api.adminReopenConversation).toHaveBeenCalledWith(USER_CONV._id),
      );
      await waitFor(() =>
        expect(api.adminListConversations).toHaveBeenCalledTimes(2),
      );
    });
  });

  describe("deleting a conversation", () => {
    function pushDeleted(conversationId: string) {
      act(() => {
        mockSocketListeners["conversation:deleted"]({ conversationId });
      });
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function openThenDelete(confirmed: boolean) {
      const user = userEvent.setup();
      jest.spyOn(window, "confirm").mockReturnValue(confirmed);
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");
      // Delete အပြီး backend list မှာ ဒီ conversation မကျန်တော့ဘူး။
      list([GUEST_CONV]);

      await user.click(screen.getByTestId("support-delete"));
      return user;
    }

    it("deletes the open conversation once the admin confirms", async () => {
      await openThenDelete(true);

      await waitFor(() =>
        expect(api.adminDeleteConversation).toHaveBeenCalledWith(USER_CONV._id),
      );
      await waitFor(() => expect(screen.queryByText("Ko Ko")).toBeNull());
      // Panel ကိုပါ ပိတ်တယ် — မရှိတော့တဲ့ id ကို ဆက်မကိုင်ဘူး။
      expect(screen.queryByTestId("support-header")).toBeNull();
    });

    it("keeps everything when the confirm is cancelled", async () => {
      await openThenDelete(false);

      expect(api.adminDeleteConversation).not.toHaveBeenCalled();
      expect(screen.getByTestId("support-header")).toBeInTheDocument();
      // List row ရော header ရော နှစ်ခုလုံး ဆက်ရှိနေတယ်။
      expect(screen.getAllByText("Ko Ko")).toHaveLength(2);
    });

    it("drops the row another admin deleted", async () => {
      await renderPage();
      list([GUEST_CONV]);

      pushDeleted(USER_CONV._id);

      await waitFor(() => expect(screen.queryByText("Ko Ko")).toBeNull());
      expect(await screen.findByText("Guest · 123e4567…")).toBeInTheDocument();
    });

    it("closes the panel when the open conversation is deleted elsewhere", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByText("Ko Ko"));
      await screen.findByTestId("support-header");

      pushDeleted(USER_CONV._id);

      await waitFor(() =>
        expect(screen.queryByTestId("support-header")).toBeNull(),
      );
    });
  });
});
