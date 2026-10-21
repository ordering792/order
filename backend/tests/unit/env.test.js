const { assertEnv } = require("../../src/config/env");

describe("server configuration validation", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("passes when the required values are present", () => {
    process.env.JWT_SECRET = "a".repeat(48);
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    expect(() => assertEnv()).not.toThrow();
  });

  it("fails when JWT_SECRET is missing", () => {
    delete process.env.JWT_SECRET;
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    expect(() => assertEnv()).toThrow(/JWT_SECRET/);
  });

  it("fails when JWT_SECRET is still a placeholder", () => {
    process.env.JWT_SECRET = "REPLACE_WITH_A_LONG_RANDOM_SECRET";
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    expect(() => assertEnv()).toThrow(/placeholder/i);
  });

  it("fails when JWT_SECRET is too short", () => {
    process.env.JWT_SECRET = "short";
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    expect(() => assertEnv()).toThrow(/JWT_SECRET/);
  });

  it("fails when MONGODB_URI is missing", () => {
    process.env.JWT_SECRET = "b".repeat(48);
    delete process.env.MONGODB_URI;

    expect(() => assertEnv()).toThrow(/MONGODB_URI/);
  });
});
