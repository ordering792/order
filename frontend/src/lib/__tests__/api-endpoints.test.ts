import { api } from "../api/index";

// Mock fetch for all api calls
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

describe("api endpoints", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("auth endpoints", () => {
    it("login sends phone + password", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: "t", user: {} }));

      await api.login({ phone: "09111", password: "secret" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ phone: "09111", password: "secret" }),
        })
      );
    });

    it("register sends all registration fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: "t", user: {} }));

      await api.register({
        name: "Alice",
        phone: "09111",
        password: "secret",
        invitationCode: "CODE",
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body).toEqual({
        name: "Alice",
        phone: "09111",
        password: "secret",
        invitationCode: "CODE",
      });
    });
  });

  describe("transaction endpoints", () => {
    it("createTransaction sends type, amount, and password for withdrawal", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ transaction: { _id: "1" } })
      );

      await api.createTransaction({
        type: "withdraw",
        amount: "100.00",
        password: "secret",
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.type).toBe("withdraw");
      expect(body.amount).toBe("100.00");
      expect(body.password).toBe("secret");
    });

    it("createTransaction omits password for deposit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ transaction: { _id: "1" } })
      );

      await api.createTransaction({
        type: "deposit",
        amount: "50.00",
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.type).toBe("deposit");
      expect(body.password).toBeUndefined();
    });

    it("createTransaction includes proofScreenshot when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ transaction: { _id: "1" } })
      );

      await api.createTransaction({
        type: "deposit",
        amount: "50.00",
        proofScreenshot: "data:image/png;base64,...",
      });

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.proofScreenshot).toBe("data:image/png;base64,...");
    });

    it("myTransactions calls GET /transactions", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ transactions: [] }));

      await api.myTransactions();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/transactions",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
      // GET is default — no explicit method set
      expect(
        (mockFetch.mock.calls[0][1] as RequestInit).method
      ).toBeUndefined();
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

  describe("authenticated requests", () => {
    it("sends token in Authorization header", async () => {
      localStorage.setItem("token", "mytoken");
      mockFetch.mockResolvedValueOnce(jsonResponse({ user: {} }));

      await api.me();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mytoken",
          }),
        })
      );
    });
  });
});
