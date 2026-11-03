const { z } = require("zod");
const mongoose = require("mongoose");
const Announcement = require("../models/Annoncement");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  recipientId: z.string().nullish(),
});

const listSchema = z.object({
  audience: z.enum(["all", "personal"]).optional(),
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  // recipientId ပေးလာရင် တကယ်ရှိတဲ့ account ဖြစ်ရမယ် — မှားနေရင် စာက
  // ဘယ်သူမှ မမြင်ရတဲ့ row အဖြစ် ကျန်သွားမယ်။
  let recipientId = null;

  if (parsed.data.recipientId) {
    if (!mongoose.isValidObjectId(parsed.data.recipientId)) {
      return res.status(400).json({ message: "Invalid recipient" });
    }

    const recipient = await User.findById(parsed.data.recipientId).select(
      "_id status",
    );

    if (!recipient || recipient.status === "burned") {
      return res.status(400).json({ message: "Recipient not found" });
    }

    recipientId = recipient._id;
  }

  const announcement = await Announcement.create({
    userId: req.user._id,
    recipientId,
    title: parsed.data.title,
    content: parsed.data.content,
  });

  res.status(201).json({ announcement });
});

exports.list = asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  // Admin က အားလုံးမြင်ရမယ် (ကိုယ်ပို့ထားတာတွေကို ပြန်စစ်ဖို့)။ တခြား role က
  // broadcast နဲ့ ကိုယ့်ဆီရောက်တဲ့ စာပဲ — ဒီ filter က security boundary ဖြစ်တယ်၊
  // frontend မှာ ဖျောက်တာက မဟုတ်ဘူး။
  let filter = { $or: [{ recipientId: null }, { recipientId: req.user._id }] };

  if (req.user.role === "admin") {
    filter = {};

    if (parsed.data.audience === "all") {
      filter = { recipientId: null };
    } else if (parsed.data.audience === "personal") {
      filter = { recipientId: { $ne: null } };
    }
  }

  const announcements = await Announcement.find(filter)
    .populate("userId", "name")
    .populate("recipientId", "name phone")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ announcements });
});

exports.getById = asyncHandler(async (req, res) => {
  // id မမှန်ရင် findById က BSONError ဖြင့် 500 ပြန်လို့ 400 အရင်ပေးမယ်။
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid announcement ID" });
  }

  const announcement = await Announcement.findById(req.params.id)
    .populate("userId", "name")
    .populate("recipientId", "name phone");

  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  // တစ်ယောက်ချင်း ပို့တဲ့ စာကို လက်ခံသူနဲ့ admin ပဲ ဖတ်ရမယ်။ 403 အစား 404 —
  // row ရှိ/မရှိ ကိုယ်တိုင် မဖော်ပြဘူး။
  const recipientId = announcement.recipientId?._id ?? announcement.recipientId;

  if (
    recipientId &&
    req.user.role !== "admin" &&
    recipientId.toString() !== req.user._id.toString()
  ) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  res.json({ announcement });
});
