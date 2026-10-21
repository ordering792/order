const asyncHandler = require("../../src/utils/asyncHandler");

describe("asyncHandler", () => {
  it("calls the wrapped function", async () => {
    const fn = jest.fn((req, res, next) => {
      res.json({ ok: true });
    });
    const req = {};
    const res = { json: jest.fn() };
    const next = jest.fn();

    await asyncHandler(fn)(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("forwards async errors to next", async () => {
    const error = new Error("fail");
    const fn = jest.fn(async () => {
      throw error;
    });
    const req = {};
    const res = {};
    const next = jest.fn();

    await asyncHandler(fn)(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("handles promise rejections", async () => {
    const error = new Error("async fail");
    const fn = jest.fn(() => Promise.reject(error));
    const req = {};
    const res = {};
    const next = jest.fn();

    await asyncHandler(fn)(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
