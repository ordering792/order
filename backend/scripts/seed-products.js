require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const Product = require("../src/models/Product");
const { toCents, decimal } = require("../src/utils/money");

const ADJECTIVES = [
  "Wireless",
  "Portable",
  "Premium",
  "Compact",
  "Smart",
  "Classic",
  "Modern",
  "Deluxe",
  "Ultra",
  "Eco",
  "Pro",
  "Lite",
  "Titanium",
  "Ceramic",
  "Organic",
  "Handmade",
  "Limited",
  "Signature",
  "Essential",
  "Advanced",
  "Minimal",
  "Vivid",
  "Cozy",
  "Rugged",
  "Elegant",
];

const NOUNS = [
  "Earbuds",
  "Backpack",
  "Lamp",
  "Bottle",
  "Headphones",
  "Keyboard",
  "Mouse",
  "Speaker",
  "Charger",
  "Wallet",
  "Watch",
  "Tripod",
  "Blanket",
  "Pillow",
  "Kettle",
  "Blender",
  "Charger Hub",
  "Notebook",
  "Pen Set",
  "Desk Mat",
];

const COUNT = 500;
const MIN_PRICE_CENTS = 5000n; // 50.00
const MAX_CENTS = 500000n; // 5000.00

const CATEGORIES = [
  "Electronics",
  "Home & Kitchen",
  "Accessories",
  "Office",
  "Lifestyle",
];

const USAGE_NOTES = {
  Electronics: "Charge fully before first use. Keep away from water.",
  "Home & Kitchen": "Rinse before first use. Hand wash recommended.",
  Accessories: "Wipe with a soft cloth. Avoid prolonged direct sunlight.",
  Office: "Use on a flat surface for the best results.",
  Lifestyle: "Follow the included instructions for everyday use.",
};

function categoryForIndex(i) {
  return CATEGORIES[i % CATEGORIES.length];
}

function priceCentsForIndex(i) {
  const span = MAX_CENTS - MIN_PRICE_CENTS;
  const step = (span * BigInt(i)) / BigInt(COUNT - 1);
  return MIN_PRICE_CENTS + step;
}

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  await connectDB();
  const existing = await Product.countDocuments();

  if (existing > 0 && !process.argv.includes("--force")) {
    console.log(
      `Product catalog already has ${existing} items — skipping (use --force to reseed)`,
    );
    await mongoose.disconnect();
    return;
  }

  if (existing > 0) {
    await Product.deleteMany({});
    console.log("Cleared existing products");
  }

  const docs = [];

  for (let i = 0; i < COUNT; i += 1) {
    const adjective = ADJECTIVES[i % ADJECTIVES.length];
    const noun = NOUNS[Math.floor(i / ADJECTIVES.length) % NOUNS.length];
    const serial = Math.floor(i / (ADJECTIVES.length * NOUNS.length)) + 1;
    const suffix = serial > 1 ? ` ${serial}` : "";

    docs.push({
      name: `${adjective} ${noun}${suffix}`,
      code: `P${String(i + 1).padStart(4, "0")}`,
      category: categoryForIndex(i),
      usage: USAGE_NOTES[categoryForIndex(i)],
      description: `${adjective} ${noun} — quality item number ${i + 1}.`,
      imageUrl: `https://picsum.photos/seed/product${i + 1}/400/400`,
      price: decimal(priceCentsForIndex(i)),
      commission: null,
    });
  }

  await Product.insertMany(docs);
  console.log(`Seeded ${COUNT} products (price 50.00 - 5000.00)`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
