import { api } from "../api/index";

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

describe("admin api endpoints", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("auth", () => {
    it("login sends phone + password", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: "t", user: {} }));

      await api.login({ phone: "09111", password: "secret" });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.phone).toBe("09111");
      expect(body.password).toBe("secret");
    });
  });

  describe("admin user management", () => {
    it("adminListUsers builds query string correctly", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ users: [], total: 0, page: 1, pages: 1 })
      );

      await api.adminListUsers({ search: "alice", role: "owner", page: 2 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("search=alice");
      expect(url).toContain("role=owner");
      expect(url).toContain("page=2");
    });

    it("adminListUsers omits missing params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ users: [], total: 0, page: 1, pages: 1 })
      );

      await api.adminListUsers({ role: "admin" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("role=admin");
      expect(url).not.toContain("search=");
      expect(url).not.toContain("status=");
    });

    it("adminListUsers hits /admin/users endpoint", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ users: [], total: 0, page: 1, pages: 1 })
      );

      await api.adminListUsers();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/admin/users",
        expect.anything()
      );
    });

    it("adminUpdateUser sends PATCH with role and status", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ user: {} }));

      await api.adminUpdateUser("u1", {
        role: "owner",
        status: "online",
      });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("/admin/users/u1");
      const init = call[1] as RequestInit;
      expect(init.method).toBe("PATCH");
      const body = JSON.parse(init.body as string);
      expect(body.role).toBe("owner");
      expect(body.status).toBe("online");
    });

    it("adminUpdateUserWalletAddress PUTs the address", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Wallet address updated", walletAddress: "Tabc" })
      );

      await api.adminUpdateUserWalletAddress("u1", "Tabc");

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe(
        "http://localhost:5000/api/admin/users/u1/wallet-address"
      );
      const init = call[1] as RequestInit;
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({ walletAddress: "Tabc" });
    });

    it("adminUpdateUserWalletAddress carries the login password for payout rows", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "ok" }));

      await api.adminUpdateUserWalletAddress("u1", "Tabc", "admin123456");

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({
        walletAddress: "Tabc",
        password: "admin123456",
      });
    });

    it("adminUpdateUser sends the password next to an owner address", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ user: {} }));

      await api.adminUpdateUser("o1", {
        cryptoAddress: "Tabc",
        password: "admin123456",
      });

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({
        cryptoAddress: "Tabc",
        password: "admin123456",
      });
    });

    it("updateOwnerCryptoAddress PUTs the address with the password", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "ok" }));

      await api.updateOwnerCryptoAddress("Tabc", "https://img/qr.png", "admin123456");

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe(
        "http://localhost:5000/api/auth/owner/crypto-address"
      );
      const init = call[1] as RequestInit;
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({
        cryptoAddress: "Tabc",
        qrUrl: "https://img/qr.png",
        password: "admin123456",
      });
    });
  });

  describe("admin transactions", () => {
    it("adminListTransactions hits /transactions/admin", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ transactions: [] }));

      await api.adminListTransactions();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/transactions/admin",
        expect.anything()
      );
    });

    it("acceptTransaction POSTs to /transactions/admin/:id/accept", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ transaction: {} }));

      await api.acceptTransaction("tx123");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/transactions/admin/tx123/accept",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("rejectTransaction POSTs with rejectionReason", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ transaction: {} }));

      await api.rejectTransaction("tx456", "Bad proof");

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("/transactions/admin/tx456/reject");
      const init = call[1] as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.rejectionReason).toBe("Bad proof");
    });
  });

  describe("admin products", () => {
    it("adminCreateProduct POSTs product data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ product: {} }));

      await api.adminCreateProduct({
        name: "Widget",
        price: "99.99",
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.name).toBe("Widget");
      expect(body.price).toBe("99.99");
    });

    it("adminDeleteProduct DELETEs by id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "deleted" }));

      await api.adminDeleteProduct("p123");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/products/p123",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("adminBulkCreateProducts sends products array", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ count: 2, products: [] })
      );

      const products = [
        { name: "A", price: "10" },
        { name: "B", price: "20" },
      ];
      await api.adminBulkCreateProducts(products);

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.products).toHaveLength(2);
    });
  });

  describe("admin plans", () => {
    it("adminCreatePlan POSTs plan with lucky positions", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plan: {} }));

      await api.adminCreatePlan({
        userId: "u1",
        totalOrders: 10,
        luckyPositions: [
          {
            orderNumber: 3,
            requiredDeposit: "50",
            luckyCommission: "10",
          },
        ],
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.userId).toBe("u1");
      expect(body.totalOrders).toBe(10);
      expect(body.luckyPositions).toHaveLength(1);
      expect(body.luckyPositions[0].orderNumber).toBe(3);
    });

    it("adminGeneratePlan POSTs depositTransactionId", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plan: {} }));

      await api.adminGeneratePlan("plan1", "tx999");

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.depositTransactionId).toBe("tx999");
      expect(mockFetch.mock.calls[0][0]).toContain(
        "/orders/plans/plan1/generate"
      );
    });

    it("adminGeneratePlan POSTs an empty body for a balance round", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plan: {} }));

      await api.adminGeneratePlan("plan1");

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.depositTransactionId).toBeUndefined();
    });

    it("adminOrderBoard builds the card query", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ rows: [], total: 0, page: 1, pages: 1 })
      );

      await api.adminOrderBoard({ search: "0912", page: 3, limit: 24 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/admin/order-board?");
      expect(url).toContain("search=0912");
      expect(url).toContain("page=3");
      expect(url).toContain("limit=24");
    });

    it("adminOrderBoard omits an empty search", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ rows: [], total: 0, page: 1, pages: 1 })
      );

      await api.adminOrderBoard({ page: 1, limit: 24 });

      expect(mockFetch.mock.calls[0][0] as string).not.toContain("search=");
    });

    it("adminUpdatePlan PATCHes the draft count and tags", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plan: {} }));

      await api.adminUpdatePlan("plan1", {
        totalOrders: 45,
        luckyPositions: [
          {
            orderNumber: 5,
            productId: null,
            requiredDeposit: "20.00",
            luckyCommission: "1.50",
          },
        ],
      });

      expect(mockFetch.mock.calls[0][0]).toContain("/orders/plans/plan1");
      expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe("PATCH");

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.totalOrders).toBe(45);
      expect(body.luckyPositions[0].productId).toBeNull();
      expect(body.luckyPositions[0].requiredDeposit).toBe("20.00");
    });

    it("adminAddLuckyPosition POSTs the mid-round tag", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plan: {} }));

      await api.adminAddLuckyPosition("plan1", {
        orderNumber: 7,
        productId: null,
        requiredDeposit: "15.00",
        luckyCommission: "2.00",
      });

      expect(mockFetch.mock.calls[0][0]).toContain(
        "/orders/plans/plan1/lucky-positions"
      );
      expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe("POST");

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body).toEqual({
        orderNumber: 7,
        productId: null,
        requiredDeposit: "15.00",
        luckyCommission: "2.00",
      });
    });

    it("adminRemoveLuckyPosition DELETEs the tag by order number", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plan: {} }));

      await api.adminRemoveLuckyPosition("plan1", 7);

      expect(mockFetch.mock.calls[0][0]).toContain(
        "/orders/plans/plan1/lucky-positions/7"
      );
      expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    });
  });

  describe("upload auth", () => {
    it("calls /uploads/auth with purpose", async () => {
      localStorage.setItem("token", "test-token");
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          token: "t",
          expire: 1,
          signature: "s",
          publicKey: "p",
          urlEndpoint: "https://ik.imagekit.io/testid",
          folder: "/products",
        })
      );

      await api.uploadAuth("product");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/uploads/auth?purpose=product",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });

  describe("admin owners", () => {
    it("adminListOwners hits /auth/owners", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ owners: [] }));

      await api.adminListOwners();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/auth/owners",
        expect.anything()
      );
    });

    it("adminCreateOwner POSTs owner details", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ owner: {} }));

      await api.adminCreateOwner({
        name: "Owner One",
        phone: "09111",
        password: "secret",
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.name).toBe("Owner One");
      expect(body.phone).toBe("09111");
    });
  });

  describe("admin support", () => {
    it("adminListConversations sends the search term", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ conversations: [], total: 0 })
      );

      await api.adminListConversations({ search: "0912345678" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/support/admin/conversations?search=0912345678",
        expect.anything()
      );
    });

    it("adminListConversations omits the query when unfiltered", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ conversations: [], total: 0 })
      );

      await api.adminListConversations();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/support/admin/conversations",
        expect.anything()
      );
    });

    it("adminListConversations sends the participant tab", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ conversations: [], total: 0 })
      );

      await api.adminListConversations({ participant: "guests" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/support/admin/conversations?participant=guests",
        expect.anything()
      );
    });

    it("adminMarkConversationRead POSTs to the read endpoint", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ conversation: {} }));

      await api.adminMarkConversationRead("65f0000000000000000000c1");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/support/admin/conversations/65f0000000000000000000c1/read",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
