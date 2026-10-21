const mongoose = require("mongoose");

function toCents(value) {
  const s = String(value);

  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error("Invalid monetary amount");
  }

  const [whole, fraction = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

function fromCents(cents) {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = String(abs % 100n).padStart(2, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function decimal(value) {
  return mongoose.Types.Decimal128.fromString(fromCents(value));
}

module.exports = { toCents, fromCents, decimal };
