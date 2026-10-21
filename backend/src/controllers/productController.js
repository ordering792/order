const { z } = require("zod");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const asyncHandler = require("../utils/asyncHandler");
const { toCents, decimal } = require("../utils/money");

const MAX_PRICE_CENTS = 500000n; // 5000.00

function parseMoney(value) {
  const cents = toCents(value);
  if (cents < 1n || cents > MAX_PRICE_CENTS) {
    throw new Error("Price must be between 0.01 and 5000.00");
  }
  return cents;
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
  usage: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().max(1000).nullish(),
  price: z.string(),
  commission: z.string().nullish(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
  usage: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().max(1000).nullish(),
  price: z.string().optional(),
  commission: z.string().nullish(),
});

const bulkSchema = z.object({
  products: z.array(createSchema).min(1).max(1000),
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  let priceCents;

  try {
    priceCents = parseMoney(parsed.data.price);
  } catch {
    return res
      .status(400)
      .json({ message: "Price must be between 0.01 and 5000.00" });
  }

  let commissionCents = null;

  if (parsed.data.commission) {
    try {
      commissionCents = toCents(parsed.data.commission);
    } catch {
      return res.status(400).json({ message: "Invalid commission" });
    }
  }

  const product = await Product.create({
    name: parsed.data.name,
    code: parsed.data.code || "",
    category: parsed.data.category || "",
    usage: parsed.data.usage || "",
    description: parsed.data.description || "",
    imageUrl: parsed.data.imageUrl ?? null,
    price: decimal(priceCents),
    commission: commissionCents === null ? null : decimal(commissionCents),
  });

  res.status(201).json({ product });
});

exports.bulkCreate = asyncHandler(async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const docs = [];

  for (const item of parsed.data.products) {
    let priceCents;

    try {
      priceCents = parseMoney(item.price);
    } catch {
      return res.status(400).json({
        message: `Price must be between 0.01 and 5000.00 (${item.name})`,
      });
    }

    let commissionCents = null;

    if (item.commission) {
      try {
        commissionCents = toCents(item.commission);
      } catch {
        return res
          .status(400)
          .json({ message: `Invalid commission (${item.name})` });
      }
    }

    docs.push({
      name: item.name,
      code: item.code || "",
      category: item.category || "",
      usage: item.usage || "",
      description: item.description || "",
      imageUrl: item.imageUrl ?? null,
      price: decimal(priceCents),
      commission: commissionCents === null ? null : decimal(commissionCents),
    });
  }

  const inserted = await Product.insertMany(docs);

  res.status(201).json({ count: inserted.length, products: inserted });
});

exports.list = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.minPrice !== undefined) {
    let cents;
    try {
      cents = toCents(String(req.query.minPrice));
    } catch {
      return res.status(400).json({ message: "Invalid minPrice" });
    }
    filter.price = { ...filter.price, $gte: decimal(cents) };
  }

  if (req.query.maxPrice !== undefined) {
    let cents;
    try {
      cents = toCents(String(req.query.maxPrice));
    } catch {
      return res.status(400).json({ message: "Invalid maxPrice" });
    }
    filter.price = { ...filter.price, $lte: decimal(cents) };
  }

  const products = await Product.find(filter).sort({ price: 1, _id: 1 });

  res.json({ products });
});

exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  const parsed = updateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const updates = {};

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.code !== undefined) updates.code = parsed.data.code;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.usage !== undefined) updates.usage = parsed.data.usage;
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }
  if (parsed.data.imageUrl !== undefined)
    updates.imageUrl = parsed.data.imageUrl;

  if (parsed.data.price !== undefined) {
    let priceCents;
    try {
      priceCents = parseMoney(parsed.data.price);
    } catch {
      return res
        .status(400)
        .json({ message: "Price must be between 0.01 and 5000.00" });
    }
    updates.price = decimal(priceCents);
  }

  if (parsed.data.commission !== undefined) {
    if (parsed.data.commission === null) {
      updates.commission = null;
    } else {
      try {
        updates.commission = decimal(toCents(parsed.data.commission));
      } catch {
        return res.status(400).json({ message: "Invalid commission" });
      }
    }
  }

  Object.assign(product, updates);
  await product.save();

  res.json({ product });
});

exports.remove = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  const product = await Product.findByIdAndDelete(id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  res.json({ message: "Product deleted" });
});
