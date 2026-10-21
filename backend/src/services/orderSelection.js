function projectedBaseCents(initialDepositCents, luckyPositions, orderNumber) {
  let base = initialDepositCents;

  for (const position of luckyPositions) {
    if (position.orderNumber < orderNumber) {
      base += position.requiredDepositCents;
    }
  }

  return base;
}

function commissionCents(priceCents) {
  return (priceCents * 5n + 500n) / 1000n;
}

function priceRangeForBase(baseCents) {
  return { lo: (baseCents * 80n) / 100n, hi: baseCents };
}

function rangeDistance(priceCents, lo, hi) {
  if (priceCents >= lo && priceCents <= hi) {
    return 0n;
  }

  return priceCents < lo ? lo - priceCents : priceCents - hi;
}

// Picks up to `count` products at or below `hi`, preferring in-range
// products, then nearest below. Deterministic: distance, then price, then id.
function selectProductsForRange(candidates, count, lo, hi) {
  const eligible = candidates.filter((candidate) => candidate.priceCents <= hi);

  eligible.sort((a, b) => {
    const distanceA = rangeDistance(a.priceCents, lo, hi);
    const distanceB = rangeDistance(b.priceCents, lo, hi);

    if (distanceA !== distanceB) {
      return distanceA < distanceB ? -1 : 1;
    }

    if (a.priceCents !== b.priceCents) {
      return a.priceCents < b.priceCents ? -1 : 1;
    }

    return String(a.id) < String(b.id) ? -1 : 1;
  });

  return eligible.slice(0, count);
}

module.exports = {
  projectedBaseCents,
  commissionCents,
  priceRangeForBase,
  selectProductsForRange,
};
