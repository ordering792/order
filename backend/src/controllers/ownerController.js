const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { normalizePhone, normalizePassword } = require("../utils/phone");
const { createUniqueCode } = require("../services/inviteService");

const createOwnerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(20),
  password: z.string().min(6).max(100),
});

exports.createOwner = asyncHandler(async (req, res) => {
  const parsed = createOwnerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { name } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  const password = normalizePassword(parsed.data.password);

  const existing = await User.findOne({ phone });

  if (existing) {
    return res.status(409).json({
      message: "Phone number already registered",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const owner = await User.create({
    name,
    phone,
    passwordHash,
    invitationCode: await createUniqueCode("invitationCode"),
    ownerInviteCode: await createUniqueCode("ownerInviteCode"),
    role: "owner",
    status: "online",
  });

  res.status(201).json({
    owner: {
      id: owner._id,
      name: owner.name,
      phone: owner.phone,
      role: owner.role,
      invitationCode: owner.invitationCode,
      ownerInviteCode: owner.ownerInviteCode,
      status: owner.status,
      createdAt: owner.createdAt,
    },
  });
});

exports.listOwners = asyncHandler(async (req, res) => {
  const owners = await User.find({ role: "owner" })
    .select(
      "name phone invitationCode ownerInviteCode status cryptoAddress cryptoQrUrl createdAt",
    )
    .sort({ createdAt: -1 });

  const ownersWithStats = await Promise.all(
    owners.map(async (owner) => {
      const userCount = await User.countDocuments({ ownerId: owner._id });
      return {
        ...owner.toObject(),
        userCount,
      };
    }),
  );

  res.json({ owners: ownersWithStats });
});
