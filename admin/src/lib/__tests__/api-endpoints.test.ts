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
});
