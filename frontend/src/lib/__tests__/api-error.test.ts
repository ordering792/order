import { ApiError } from "../api/types";

describe("ApiError", () => {
  it("stores status and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores errors array", () => {
    const errors = [{ path: ["field"], message: "Required" }];
    const err = new ApiError(400, "Bad request", errors);
    expect(err.errors).toEqual(errors);
  });

  it("works with instanceof", () => {
    const err = new ApiError(500, "Server error");
    expect(err instanceof ApiError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
