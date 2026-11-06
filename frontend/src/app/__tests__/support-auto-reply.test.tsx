import { act, fireEvent, render, screen } from "@testing-library/react";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import SupportPage from "@/app/support/page";

const mockMyConversations = api.myConversations as jest.Mock;
const mockStartConversation = api.startConversation as jest.Mock;
const mockGetConversation = api.getConversation as jest.Mock;
const mockSendSupportMessage = api.sendSupportMessage as jest.Mock;

const mockSocketHandlers: Record<string, (payload: unknown) => void> = {};

const CONV_ID = "conv-auto-1";
const GREETING =
  "Hello! Thank you for contacting Rakuten. What can I assist you with today?";
const WITHDRAW_ANSWER =
  "Once all the orders in your account are completed, you can withdraw your funds Thank you for contacting Rakuten";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth", () => {
  // Mount effect က [user] ကို dep အဖြစ် သုံးတယ် — render တိုင်း object အသစ်
  // ပြန်ဖန်တီးရင် effect က အနန္တ loop ဝင်တယ်။
  const session = { user: { id: "u1", name: "Test User" }, loading: false };
  return { useAuth: () => session };
});

jest.mock("@/lib/socket", () => ({
  getSocket: () => ({
    connected: true,
    emit: jest.fn(),
    on: (event: string, handler: (payload: unknown) => void) => {
      mockSocketHandlers[event] = handler;
    },
    off: jest.fn(),
  }),
}));

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getStoredUser: () => null,
  api: {
    myConversations: jest.fn(),
    startConversation: jest.fn(),
    getConversation: jest.fn(),
    sendSupportMessage: jest.fn(),
  },
}));

function autoMessage(id: string, body: string, createdAt: string) {
  return { _id: id, senderType: "admin", body, createdAt, autoKind: "greeting" };
}

async function mountSupport() {
  render(
    <LanguageProvider>
      <SupportPage />
    </LanguageProvider>,
  );

  const input = screen.getByPlaceholderText("Type your message here...");
  // Mount effect က conversationId ကို setState လုပ်ပြီးမှ socket effect ဝင်တယ်။
  await act(async () => {
    await Promise.resolve();
  });

  return input;
}

async function send(input: HTMLElement, body: string) {
  fireEvent.change(input, { target: { value: body } });
  const form = input.closest("form");
  if (!form) throw new Error("message form is missing");

  await act(async () => {
    fireEvent.submit(form);
  });
}

beforeAll(() => {
  // jsdom မှာ scrollIntoView မရှိ — chat auto-scroll effect က mount တိုင်း ခေါ်တယ်။
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMyConversations.mockResolvedValue({
    conversations: [{ _id: CONV_ID }],
  });
  mockStartConversation.mockResolvedValue({ conversation: { _id: CONV_ID } });
  mockGetConversation.mockResolvedValue({ conversation: {}, messages: [] });
});

// Client rule: ပထမအကြိမ်စာပို့ရင် greeting, keyword ပါရင် အဖြေ — ဘာသာပြန်တာ
// အကုန် backend မှာ hardcoded, UI က response ထဲပါ autoReplies ကိုပဲ ပြတယ်။
describe("support auto reply rendering", () => {
  it("shows the greeting the send response carries, under a CS bubble", async () => {
    mockSendSupportMessage.mockResolvedValue({
      message: { _id: "m1" },
      autoReplies: [autoMessage("a1", GREETING, "2026-11-06T10:00:01.000Z")],
    });

    const input = await mountSupport();
    await send(input, "hello support");

    expect(screen.getByText(GREETING)).toBeInTheDocument();
    // User ရဲ့ စာက temp bubble ပေါ်မှာ ဆက်နေရမယ် — socket event မတိုင်ခင်
    // auto reply ကို အစားထိုးခွင့် မပေးရ။
    expect(screen.getByText("hello support")).toBeInTheDocument();
    expect(screen.getAllByText("CS")).toHaveLength(1);
  });

  it("shows both the greeting and the keyword answer in order", async () => {
    mockSendSupportMessage.mockResolvedValue({
      message: { _id: "m1" },
      autoReplies: [
        autoMessage("a1", GREETING, "2026-11-06T10:00:01.000Z"),
        {
          ...autoMessage("a2", WITHDRAW_ANSWER, "2026-11-06T10:00:01.001Z"),
          autoKind: "keyword",
          autoKey: "withdraw",
        },
      ],
    });

    const input = await mountSupport();
    await send(input, "can I withdraw?");

    const bubbles = screen.getAllByText(/Rakuten/).map((node) => node.textContent);
    expect(bubbles).toEqual([GREETING, WITHDRAW_ANSWER]);
  });

  it("does not render a reply the socket already delivered", async () => {
    let resolveSend: (value: unknown) => void = () => {};
    mockSendSupportMessage.mockImplementation(
      () => new Promise((resolve) => { resolveSend = resolve; }),
    );

    const input = await mountSupport();
    const reply = autoMessage("a1", GREETING, "2026-11-06T10:00:01.000Z");

    fireEvent.change(input, { target: { value: "hello" } });
    const form = input.closest("form") as HTMLFormElement;

    await act(async () => {
      fireEvent.submit(form);
      // Socket က အရင်ရောက်တဲ့ case — response က ဒုတိယလာရင် duplicate မထည့်ရ။
      mockSocketHandlers["message:new"]({
        conversationId: CONV_ID,
        message: reply,
      });
      resolveSend({ message: { _id: "m1" }, autoReplies: [reply] });
    });

    expect(screen.getAllByText(GREETING)).toHaveLength(1);
  });

  it("renders nothing extra when the backend sends no auto reply", async () => {
    mockSendSupportMessage.mockResolvedValue({ message: { _id: "m1" }, autoReplies: [] });

    const input = await mountSupport();
    await send(input, "second message");

    expect(screen.getByText("second message")).toBeInTheDocument();
    expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
    expect(screen.queryByText("CS")).not.toBeInTheDocument();
  });
});
