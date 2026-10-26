function projectedBaseCents(initialDepositCents, luckyPositions, orderNumber) {
  let base = initialDepositCents;

  for (const position of luckyPositions) {
    if (position.orderNumber < orderNumber) {
      base += position.requiredDepositCents;
    }
  }

  return base;
}

// Commission rate အတွက် ရင်းမြစ်တစ်ခုတည်း။ grabController ရဲ့ display
// ကလည်း ဒီကိန်းကိုပဲ သုံးတယ် — နှစ်နေရာ ခွဲထည့်ထားလို့ မရ။
const COMMISSION_BASIS_POINTS = 50n; // 0.50%

function commissionCents(priceCents) {
  return (priceCents * COMMISSION_BASIS_POINTS + 5000n) / 10000n;
}

function priceRangeForBase(baseCents) {
  return { lo: (baseCents * 80n) / 100n, hi: baseCents };
}

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// Picks up to `count` products inside [lo, hi] — the 80%–100% band of the
// user's deposit. In-range products are picked at RANDOM so every user gets a
// different order sequence (the old behaviour always picked the cheapest
// product first, so all users saw the same orders).
// When the catalog has too few in-range products we fall back to the nearest
// ones below the range.
function selectProductsForRange(candidates, count, lo, hi) {
  const eligible = candidates.filter((candidate) => candidate.priceCents <= hi);
  const inRange = eligible.filter((candidate) => candidate.priceCents >= lo);
  const below = eligible
    .filter((candidate) => candidate.priceCents < lo)
    .sort((a, b) => (a.priceCents > b.priceCents ? -1 : 1));

  return [...shuffle(inRange), ...below].slice(0, count);
}

module.exports = {
  COMMISSION_BASIS_POINTS,
  projectedBaseCents,
  commissionCents,
  priceRangeForBase,
  selectProductsForRange,
};
