const {
  projectedBaseCents,
  commissionCents,
  priceRangeForBase,
  selectProductsForRange,
} = require("../../src/services/orderSelection");

describe("projectedBaseCents", () => {
  it("returns initial deposit when there are no lucky positions", () => {
    expect(projectedBaseCents(50000n, [], 1)).toBe(50000n);
    expect(projectedBaseCents(50000n, [], 40)).toBe(50000n);
  });

  it("adds lucky deposits only after their position", () => {
    const luckies = [
      { orderNumber: 15, requiredDepositCents: 25000n },
      { orderNumber: 31, requiredDepositCents: 10000n },
    ];

    expect(projectedBaseCents(50000n, luckies, 1)).toBe(50000n);
    expect(projectedBaseCents(50000n, luckies, 14)).toBe(50000n);
    expect(projectedBaseCents(50000n, luckies, 15)).toBe(50000n);
    expect(projectedBaseCents(50000n, luckies, 16)).toBe(75000n);
    expect(projectedBaseCents(50000n, luckies, 31)).toBe(75000n);
    expect(projectedBaseCents(50000n, luckies, 32)).toBe(85000n);
    expect(projectedBaseCents(50000n, luckies, 50)).toBe(85000n);
  });

  it("ignores zero-deposit lucky positions", () => {
    const luckies = [{ orderNumber: 5, requiredDepositCents: 0n }];

    expect(projectedBaseCents(50000n, luckies, 6)).toBe(50000n);
  });
});

describe("commissionCents", () => {
  it("computes 0.5% rounded half-up to the nearest cent", () => {
    expect(commissionCents(10000n)).toBe(50n);
    expect(commissionCents(1001n)).toBe(5n);
    expect(commissionCents(9999n)).toBe(50n);
    expect(commissionCents(40000n)).toBe(200n);
    expect(commissionCents(0n)).toBe(0n);
    expect(commissionCents(75000n)).toBe(375n);
  });
});

describe("priceRangeForBase", () => {
  it("returns 80% to 100% of base", () => {
    expect(priceRangeForBase(50000n)).toEqual({ lo: 40000n, hi: 50000n });
    expect(priceRangeForBase(75000n)).toEqual({ lo: 60000n, hi: 75000n });
  });

  it("floors the 80% bound", () => {
    expect(priceRangeForBase(10001n).lo).toBe(8000n);
  });
});

describe("selectProductsForRange", () => {
  const p = (id, priceCents) => ({ id, priceCents });

  it("prefers products inside the range", () => {
    const candidates = [
      p("a", 30000n),
      p("b", 45000n),
      p("c", 70000n),
      p("d", 48000n),
    ];

    const picked = selectProductsForRange(candidates, 2, 40000n, 50000n);

    expect(picked.map((x) => x.id).sort()).toEqual(["b", "d"]);
  });

  it("never picks a product above the upper bound", () => {
    const candidates = [p("a", 51000n), p("b", 49000n), p("c", 35000n)];

    const picked = selectProductsForRange(candidates, 3, 40000n, 50000n);

    expect(picked.map((x) => x.id).sort()).toEqual(["b", "c"]);
  });

  it("falls back to nearest below the range when needed", () => {
    const candidates = [p("far", 10000n), p("near", 39000n), p("in", 42000n)];

    const picked = selectProductsForRange(candidates, 3, 40000n, 50000n);

    expect(picked.map((x) => x.id)).toEqual(["in", "near", "far"]);
  });

  it("returns only what is available when insufficient", () => {
    const candidates = [p("a", 41000n), p("b", 49000n)];

    const picked = selectProductsForRange(candidates, 5, 40000n, 50000n);

    expect(picked).toHaveLength(2);
  });

  it("returns empty when nothing fits the bound", () => {
    const candidates = [p("a", 90000n)];

    expect(selectProductsForRange(candidates, 1, 40000n, 50000n)).toEqual([]);
  });

  it("picks randomly among products inside the range", () => {
    const candidates = [p("b", 45000n), p("a", 45000n)];

    const pickedIds = new Set();

    for (let i = 0; i < 200; i += 1) {
      pickedIds.add(selectProductsForRange(candidates, 1, 40000n, 50000n)[0].id);
    }

    // ၂၀၀ ခေါ် ဆွဲရင် နှစ်လုံးလုံး ပေါ်လာမယ် (random သောလာ)
    expect(pickedIds).toEqual(new Set(["a", "b"]));
  });

  it("never picks a product above the upper bound, even when random", () => {
    const candidates = [
      p("a", 51000n),
      p("b", 49000n),
      p("c", 48000n),
      p("d", 47000n),
    ];

    for (let i = 0; i < 50; i += 1) {
      const picked = selectProductsForRange(candidates, 2, 40000n, 50000n);
      expect(picked.every((x) => x.priceCents <= 50000n)).toBe(true);
    }
  });
});
