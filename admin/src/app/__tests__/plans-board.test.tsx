import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiBoardRow, ApiTask } from "@/lib/api";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminPlansPage from "@/app/plans/page";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      adminOrderBoard: jest.fn(),
      adminCreatePlan: jest.fn(),
      adminUpdatePlan: jest.fn(),
      adminAddLuckyPosition: jest.fn(),
      adminGeneratePlan: jest.fn(),
      adminDeletePlan: jest.fn(),
      adminListUserTasks: jest.fn(),
      completeTask: jest.fn(),
    },
  };
});

const USER = {
  _id: "65f0000000000000000000a1",
  name: "Ko Ko",
  phone: "0912345678",
  invitationCode: "AB12CD",
  balance: "125.50",
};

const PLAN_ID = "65f0000000000000000000b1";

function row(overrides: Partial<ApiBoardRow> = {}): ApiBoardRow {
  return { user: USER, plan: null, ...overrides };
}

function draftPlan(overrides: Partial<NonNullable<ApiBoardRow["plan"]>> = {}) {
  return {
    _id: PLAN_ID,
    userId: USER._id,
    status: "draft" as const,
    totalOrders: 40,
    completedCount: 0,
    luckyPositions: [],
    ...overrides,
  };
}

function board(rows: ApiBoardRow[]) {
  (api.adminOrderBoard as jest.Mock).mockResolvedValue({
    rows,
    total: rows.length,
    page: 1,
    pages: 1,
  });
}

async function renderPage() {
  render(
    <LanguageProvider>
      <AdminPlansPage />
    </LanguageProvider>,
  );

  const [card] = await screen.findAllByTestId("order-card");
  return card;
}

const TASKS: ApiTask[] = [
  {
    _id: "65f0000000000000000000c1",
    orderNumber: 1,
    productName: "iPhone 15",
    price: "100.00",
    commission: "0.50",
    status: "assigned",
  },
  {
    _id: "65f0000000000000000000c2",
    orderNumber: 2,
    productName: "AirPods",
    price: "80.00",
    commission: "0.40",
    status: "available",
  },
];

beforeEach(() => {
  board([row()]);
  (api.adminCreatePlan as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminUpdatePlan as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminAddLuckyPosition as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminGeneratePlan as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminDeletePlan as jest.Mock).mockReset().mockResolvedValue({});
  (api.adminListUserTasks as jest.Mock).mockReset().mockResolvedValue({
    tasks: TASKS,
  });
  (api.completeTask as jest.Mock).mockReset().mockResolvedValue({});
});

describe("Admin order plan board", () => {
  it("shows one card per user with uid and balance", async () => {
    board([
      row(),
      row({
        user: { ...USER, _id: "65f0000000000000000000a2", name: "Ma Ma" },
      }),
    ]);
    await renderPage();

    expect(await screen.findByText("Ko Ko")).toBeInTheDocument();
    expect(screen.getByText("Ma Ma")).toBeInTheDocument();

    const first = await renderPage();

    expect(first).toHaveTextContent("UID AB12CD");
    expect(first).toHaveTextContent("0912345678");
    expect(first).toHaveTextContent("125.50");
    expect(first).toHaveTextContent("No plan");
    expect(screen.getAllByTestId("order-card")).toHaveLength(2);

    expect(api.adminOrderBoard).toHaveBeenCalledWith({
      page: 1,
      limit: 24,
      search: undefined,
    });
  });

  it("labels a user without a round and opens a draft with the typed count", async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(screen.getByTestId("order-card")).toHaveTextContent("No plan");

    const input = screen.getByTestId("card-order-count");
    await user.clear(input);
    await user.type(input, "60");
    await user.click(screen.getByTestId("card-save"));

    await waitFor(() =>
      expect(api.adminCreatePlan).toHaveBeenCalledWith({
        userId: USER._id,
        totalOrders: 60,
        luckyPositions: [],
      }),
    );
    expect(await screen.findByText("Round opened with 60 orders")).toBeInTheDocument();
  });

  it("saves a draft round together with its lucky tags", async () => {
    const user = userEvent.setup();
    board([
      row({
        plan: draftPlan({
          luckyPositions: [
            {
              orderNumber: 5,
              productId: null,
              requiredDeposit: "20.00",
              luckyCommission: "1.50",
            },
          ],
        }),
      }),
    ]);
    await renderPage();

    expect(screen.getByDisplayValue("20.00")).toBeInTheDocument();
    // Each lucky column is captioned above its inputs.
    expect(screen.getByText("Order number")).toBeInTheDocument();
    expect(screen.getByText("Required deposit")).toBeInTheDocument();
    expect(screen.getByText("Lucky commission")).toBeInTheDocument();

    const input = screen.getByTestId("card-order-count");
    await user.clear(input);
    await user.type(input, "45");
    await user.click(screen.getByTestId("card-save"));

    await waitFor(() =>
      expect(api.adminUpdatePlan).toHaveBeenCalledWith(PLAN_ID, {
        totalOrders: 45,
        luckyPositions: [
          {
            orderNumber: 5,
            productId: null,
            requiredDeposit: "20.00",
            luckyCommission: "1.50",
          },
        ],
      }),
    );
  });

  it("locks the order count of a generated round and offers no save or generate", async () => {
    board([
      row({
        plan: draftPlan({ status: "generated", completedCount: 12 }),
      }),
    ]);
    await renderPage();

    expect(screen.getByTestId("card-order-count-locked")).toBeDisabled();
    expect(screen.getByTestId("card-order-count-locked")).toHaveValue(40);
    expect(screen.queryByTestId("card-save")).toBeNull();
    expect(screen.queryByTestId("card-generate")).toBeNull();
    expect(screen.getByTestId("order-card")).toHaveTextContent("Round in progress");
  });

  it("generates from the user balance only — no deposit id is sent", async () => {
    const user = userEvent.setup();
    board([row({ plan: draftPlan() })]);
    await renderPage();

    await user.click(screen.getByTestId("card-generate"));

    await waitFor(() => expect(api.adminGeneratePlan).toHaveBeenCalledWith(PLAN_ID));
    expect((api.adminGeneratePlan as jest.Mock).mock.calls[0]).toHaveLength(1);
  });

  it("adds a lucky order onto an order that is not tested yet", async () => {
    const user = userEvent.setup();
    board([
      row({
        plan: draftPlan({ status: "generated", currentBase: "125.50" }),
      }),
    ]);
    await renderPage();

    const input = screen.getByTestId("new-lucky-number");
    const deposit = screen.getByLabelText("Required deposit");
    const commission = screen.getByLabelText("Lucky commission");

    await user.clear(input);
    await user.type(input, "7");
    await user.clear(deposit);
    await user.type(deposit, "15.00");
    await user.clear(commission);
    await user.type(commission, "2.00");
    await user.click(screen.getByTestId("card-add-lucky"));

    await waitFor(() =>
      expect(api.adminAddLuckyPosition).toHaveBeenCalledWith(PLAN_ID, {
        orderNumber: 7,
        productId: null,
        requiredDeposit: "15.00",
        luckyCommission: "2.00",
      }),
    );
    expect(await screen.findByText("Lucky order added on order #7")).toBeInTheDocument();
    // A successful injection clears the row so it can't be submitted twice.
    expect(screen.getByTestId("new-lucky-number")).toHaveValue(null);
    expect(screen.getByTestId("card-add-lucky")).toBeDisabled();
  });

  it("keeps the typed lucky values when the backend rejects the injection", async () => {
    const user = userEvent.setup();
    board([row({ plan: draftPlan({ status: "generated" }) })]);
    (api.adminAddLuckyPosition as jest.Mock).mockRejectedValueOnce(
      new Error("Order 7 is already in progress"),
    );
    await renderPage();

    await user.type(screen.getByTestId("new-lucky-number"), "7");
    await user.click(screen.getByTestId("card-add-lucky"));

    expect(
      await screen.findByText("Order 7 is already in progress"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("new-lucky-number")).toHaveValue(7);
  });

  it("opens the round tasks as a drawer and completes an order", async () => {
    const user = userEvent.setup();
    board([
      row({
        plan: draftPlan({ status: "generated", completedCount: 1 }),
      }),
    ]);
    await renderPage();

    await user.click(screen.getByTestId("card-tasks"));

    expect(await screen.findByTestId("tasks-drawer")).toBeInTheDocument();
    expect(api.adminListUserTasks).toHaveBeenCalledWith(USER._id, PLAN_ID);
    expect(await screen.findByText("iPhone 15")).toBeInTheDocument();
    expect(screen.getByText("AirPods")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(api.completeTask).toHaveBeenCalledWith("65f0000000000000000000c1"),
    );
  });

  it("re-queries the board with the search text", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByTestId("board-search"), "Ma Ma");

    await waitFor(() =>
      expect(api.adminOrderBoard).toHaveBeenLastCalledWith({
        page: 1,
        limit: 24,
        search: "Ma Ma",
      }),
    );
  });
});
