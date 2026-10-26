import { formatMoney, money, moneyNumber } from "../money";

describe("money helper", () => {
  it("returns '—' for null", () => {
    expect(money(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(money(undefined)).toBe("—");
  });

  it("formats a number to 2 decimal places", () => {
    expect(money(50)).toBe("50.00");
    expect(money(0)).toBe("0.00");
    expect(money(1234.5)).toBe("1234.50");
  });

  it("passes a string through unchanged", () => {
    expect(money("99.99")).toBe("99.99");
    expect(money("0.00")).toBe("0.00");
  });

  it("extracts $numberDecimal from Decimal128 shape", () => {
    expect(money({ $numberDecimal: "50.00" })).toBe("50.00");
    expect(money({ $numberDecimal: "0.00" })).toBe("0.00");
  });

  it("returns '—' for malformed Decimal128 shape", () => {
    expect(money({} as { $numberDecimal: string })).toBe("—");
  });
});

describe("moneyNumber", () => {
  it("parses the Decimal128 shape", () => {
    expect(moneyNumber({ $numberDecimal: "250.00" })).toBe(250);
  });

  it("parses plain strings and numbers", () => {
    expect(moneyNumber("1234.50")).toBe(1234.5);
    expect(moneyNumber(50)).toBe(50);
  });

  it("falls back to 0 instead of NaN", () => {
    expect(moneyNumber(null)).toBe(0);
    expect(moneyNumber(undefined)).toBe(0);
    expect(moneyNumber("abc")).toBe(0);
  });
});

describe("formatMoney", () => {
  it("groups thousands with two decimals", () => {
    expect(formatMoney({ $numberDecimal: "1234.50" })).toBe("1,234.50");
    expect(formatMoney("100000")).toBe("100,000.00");
  });

  it("never renders NaN", () => {
    expect(formatMoney(null)).toBe("0.00");
    expect(formatMoney("abc")).toBe("0.00");
  });
});
