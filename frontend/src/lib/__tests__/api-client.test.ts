import { ApiError } from "../api/types";
import {
  getToken,
  getStoredUser,
  storeSession,
  clearSession,
  request,
  SESSION_EXPIRED_EVENT,
} from "../api/client";

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  const init = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: new Headers({ "Content-Type": "application/json" }),
  };
  return init as Response;
}

describe("api client", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("getToken", () => {
    it("returns null when no token stored", () => {
      expect(getToken()).toBeNull();
    });

    it("returns the stored token", () => {
      localStorage.setItem("token", "abc123");
      expect(getToken()).toBe("abc123");
    });
  });

  describe("getStoredUser", () => {
    it("returns null when nothing stored", () => {
      expect(getStoredUser()).toBeNull();
    });

    it("returns parsed user object", () => {
      const user = { id: "1", name: "Alice", phone: "09111" };
      localStorage.setItem("user", JSON.stringify(user));
      expect(getStoredUser()).toEqual(user);
    });

    it("returns null for malformed JSON", () => {
      localStorage.setItem("user", "not-json{{{");
      expect(getStoredUser()).toBeNull();
    });
  });

  describe("storeSession", () => {
    it("stores token and user", () => {
      const user = {
        id: "1",
        name: "Alice",
        phone: "09111",
        invitationCode: "CODE",
        role: "user" as const,
      };
      storeSession("tok123", user);
      expect(localStorage.getItem("token")).toBe("tok123");
      expect(JSON.parse(localStorage.getItem("user") || "")).toEqual(user);
    });
  });

  describe("clearSession", () => {
    it("removes token and user", () => {
      localStorage.setItem("token", "t");
      localStorage.setItem("user", "{}");
      clearSession();
      expect(localStorage.getItem("token")).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
    });
  });

  describe("request", () => {
    it("makes a GET request with correct URL", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      await request("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("includes Authorization header when token present", async () => {
      localStorage.setItem("token", "mytoken");
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await request("/secure");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mytoken",
          }),
        })
      );
    });

    it("does not set Content-Type for FormData", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      const formData = new FormData();
      formData.append("file", "data");

      await request("/upload", { method: "POST", body: formData });

      const headers = (mockFetch.mock.calls[0][1] as RequestInit)
        .headers as Record<string, string>;
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("sends JSON body for POST", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await request("/create", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: '{"name":"test"}',
        })
      );
    });

    it("returns parsed JSON on success", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 42, name: "Alice" }));

      const result = await request<{ id: number; name: string }>("/user");
      expect(result).toEqual({ id: 42, name: "Alice" });
    });

    it("throws ApiError on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Unauthorized" }, 401)
      );

      await expect(request("/protected")).rejects.toThrow(ApiError);
    });

    it("clears the session and emits the expiry event on 401", async () => {
      storeSession("tok123", {
        id: "1",
        name: "Alice",
        phone: "09111",
        invitationCode: "CODE",
        role: "user" as const,
      });
      const onExpired = jest.fn();
      window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Unauthorized" }, 401)
      );

      await expect(request("/protected")).rejects.toMatchObject({ status: 401 });

      expect(localStorage.getItem("token")).toBeNull();
      expect(onExpired).toHaveBeenCalledTimes(1);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    });

    it("does not emit the expiry event on other errors", async () => {
      const onExpired = jest.fn();
      window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Forbidden" }, 403)
      );

      await expect(request("/protected")).rejects.toMatchObject({ status: 403 });

      expect(onExpired).not.toHaveBeenCalled();
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    });

    it("includes error details in ApiError", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            message: "Validation failed",
            errors: [{ path: ["email"], message: "Invalid" }],
          },
          400
        )
      );

      const promise = request("/validate");
      await expect(promise).rejects.toBeInstanceOf(ApiError);
      await expect(promise).rejects.toMatchObject({
        status: 400,
        message: "Validation failed",
      });
    });

    it("uses fallback message when response has no message", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      await expect(request("/error")).rejects.toMatchObject({
        status: 500,
        message: "Request failed (500)",
      });
    });

    it("handles response with no JSON body gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response);

      await expect(request("/error")).rejects.toMatchObject({
        status: 500,
      });
    });
  });
});
