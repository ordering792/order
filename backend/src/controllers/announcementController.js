const { z } = require("zod");
const Announcement = require("../models/Annoncement");
const asyncHandler = require("../utils/asyncHandler");

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const announcement = await Announcement.create({
    userId: req.user._id,
    title: parsed.data.title,
    content: parsed.data.content,
  });

  res.status(201).json({ announcement });
});

exports.list = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find()
    .populate("userId", "name")
    .sort({ createdAt: -1 });

  res.json({ announcements });
});

exports.getById = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id).populate(
    "userId",
    "name",
  );

  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  res.json({ announcement });
});
