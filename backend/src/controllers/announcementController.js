const { z } = require("zod");
const mongoose = require("mongoose");
const Announcement = require("../models/Annoncement");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const {
  visibleAnnouncementFilter,
} = require("../services/announcementVisibility");
const { ownerUserIds } = require("../services/ownershipService");

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

  const isOwner = req.user.role === "owner";

  // recipientId ပေးလာရင် တကယ်ရှိတဲ့ account ဖြစ်ရမယ် — မှားနေရင် စာက
  // ဘယ်သူမှ မမြင်ရတဲ့ row အဖြစ် ကျန်သွားမယ်။
  let recipientId = null;

  if (parsed.data.recipientId) {
    if (!mongoose.isValidObjectId(parsed.data.recipientId)) {
      return res.status(400).json({ message: "Invalid recipient" });
    }

    const recipient = await User.findById(parsed.data.recipientId).select(
      "_id status ownerId",
    );

    if (!recipient || recipient.status === "burned") {
      return res.status(400).json({ message: "Recipient not found" });
    }

    // Owner က ကိုယ့် downline ထဲက user ကိုပဲ ပို့လို့ရတယ် (ကိုယ်တိုင်ပါ — picker ထဲမှာ
    // listUsers ရဲ့ scope အတိုင်း ပေါ်နေလို့)။ တခြား owner/admin row ကို မရဘူး။
    if (
      isOwner &&
      !recipient._id.equals(req.user._id) &&
      (!recipient.ownerId || !recipient.ownerId.equals(req.user._id))
    ) {
      return res.status(403).json({
        message: "You can only send announcements to your own users",
      });
    }

    recipientId = recipient._id;
  }

  // Owner ရဲ့ "All users" ဆိုတာ သူ့ downline အားလုံး — recipientId null (system
  // တစ်ခုလုံး) မဖြစ်ရအောင် တစ်ယောက်ချင်း row ခွဲရေးတယ်။ ဒါကြောင့် customer ဘက်က
  // visibility filter / unread count / getById ကို ပြင်စရာ မလိုဘူး။
  if (isOwner && !recipientId) {
    const downline = await ownerUserIds(req.user._id);
    const targets = downline.length
      ? await User.find({ _id: { $in: downline }, status: { $ne: "burned" } })
          .select("_id")
          .lean()
      : [];

    if (!targets.length) {
      return res.status(400).json({ message: "No users to notify" });
    }

    await Announcement.insertMany(
      targets.map((target) => ({
        userId: req.user._id,
        recipientId: target._id,
        title: parsed.data.title,
        content: parsed.data.content,
      })),
    );

    return res.status(201).json({ created: targets.length });
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

  // Admin က အားလုံးမြင်ရမယ် (ကိုယ်ပို့ထားတာတွေကို ပြန်စစ်ဖို့)။ Owner က ကိုယ်ပို့ထားတာ
  // နဲ့ broadcast တွေပဲ — သူပို့တဲ့ targeted row တွေက သူ့ဆီ ပြန်ပေါ်ရမယ်။ တခြား role က
  // broadcast နဲ့ ကိုယ့်ဆီရောက်တဲ့ စာပဲ — ဒီ filter က security boundary ဖြစ်တယ်၊
  // frontend မှာ ဖျောက်တာက မဟုတ်ဘူး။
  let filter;

  if (req.user.role === "admin") {
    filter = {};
  } else if (req.user.role === "owner") {
    filter = {
      $or: [
        { userId: req.user._id },
        { recipientId: null },
        { recipientId: req.user._id },
      ],
    };
  } else {
    filter = visibleAnnouncementFilter(req.user);
  }

  // Audience filter ကို admin/owner panel မှာပဲ သုံးတယ် — customer ရဲ့ list ကို
  // param နဲ့ ကျယ်သွားအောင် မလုပ်ရ။
  if (parsed.data.audience && req.user.role !== "user") {
    const narrowed =
      parsed.data.audience === "all"
        ? { recipientId: null }
        : { recipientId: { $ne: null } };

    filter =
      req.user.role === "admin" ? narrowed : { $and: [filter, narrowed] };
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
