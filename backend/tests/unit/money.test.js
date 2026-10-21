const { toCents, fromCents, decimal } = require("../../src/utils/money");

describe("money utils", () => {
  describe("toCents", () => {
    it("converts whole numbers", () => {
      expect(toCents("10")).toBe(1000n);
    });

    it("converts decimal numbers", () => {
      expect(toCents("10.50")).toBe(1050n);
    });

    it("converts single decimal place", () => {
      expect(toCents("5.5")).toBe(550n);
    });

    it("converts zero", () => {
      expect(toCents("0")).toBe(0n);
    });

    it("throws on invalid input", () => {
      expect(() => toCents("abc")).toThrow("Invalid monetary amount");
    });

    it("throws on more than 2 decimal places", () => {
      expect(() => toCents("10.555")).toThrow("Invalid monetary amount");
    });
  });

  describe("fromCents", () => {
    it("converts cents to string", () => {
      expect(fromCents(1050n)).toBe("10.50");
    });

    it("converts zero cents", () => {
      expect(fromCents(0n)).toBe("0.00");
    });

    it("converts negative cents", () => {
      expect(fromCents(-500n)).toBe("-5.00");
    });

    it("converts single digit cents", () => {
      expect(fromCents(5n)).toBe("0.05");
    });
  });

  describe("decimal", () => {
    it("creates a Decimal128 from cents", () => {
      const d = decimal(1050n);
      expect(d.toString()).toBe("10.50");
    });
  });

  describe("round-trip", () => {
    it("toCents and fromCents are inverses", () => {
      expect(fromCents(toCents("25.99"))).toBe("25.99");
    });
  });
});
