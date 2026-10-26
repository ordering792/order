import { uploadToImageKit, validateImageFile } from "../uploadImage";

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

describe("uploadImage", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("rejects unsupported file types", () => {
    const file = new File(["x"], "file.txt", { type: "text/plain" });
    expect(() => validateImageFile(file)).toThrow(/JPG/i);
  });

  it("rejects oversized files", () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    expect(() => validateImageFile(file, 5 * 1024 * 1024)).toThrow(/5MB/i);
  });

  it("requests upload auth and posts file to ImageKit", async () => {
    localStorage.setItem("token", "test-token");
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          token: "upload-token",
          expire: 123,
          signature: "sig",
          publicKey: "public_test",
          urlEndpoint: "https://ik.imagekit.io/testid",
          folder: "/deposit-proofs",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          url: "https://ik.imagekit.io/testid/deposit-proofs/proof.png",
        }),
      );

    const file = new File(["abc"], "proof.png", { type: "image/png" });
    const url = await uploadToImageKit(file, "deposit-proof");

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:5000/api/uploads/auth?purpose=deposit-proof",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
    expect(url).toBe("https://ik.imagekit.io/testid/deposit-proofs/proof.png");
  });
});
