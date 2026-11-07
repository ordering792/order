const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { normalizePhone, normalizePassword } = require("../utils/phone");
const { createUniqueCode } = require("../services/inviteService");
const { deviceInfo } = require("../utils/deviceInfo");
const { isOnline } = require("../services/presenceService");

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

// Owners page ရဲ့ ကော်လံတစ်ကြောင်း = owner တစ်ယောက် — admin ထိန်းချုပ်ခလုတ်တွေ
// (reset, role လျှော့, burn, note) ဒီ payload ပေါ်မှာ ရပ်တည်တယ်။ adminNote က admin
// ဆီပဲ သွားရမယ် — ဒီ route က adminOnly ဖြစ်လို့ ဒါက နယ်နိမိတ်။ balance က ရည်ရွယ်ချက်
// ရှိရှိ မတောင်းဘူး (Owners page ရဲ့ Amount က $— အဖြစ် သေချာထားပြီး)။
exports.listOwners = asyncHandler(async (req, res) => {
  const owners = await User.find({ role: "owner" })
    .select(
      "name phone invitationCode ownerInviteCode status cryptoAddress cryptoQrUrl createdAt ipAddress lastLoginAt lastSeenAt lastUserAgent +adminNote",
    )
    .sort({ createdAt: -1 })
    .lean();

  const ownersWithStats = await Promise.all(
    owners.map(async (owner) => {
      const userCount = await User.countDocuments({ ownerId: owner._id });
      return {
        ...owner,
        userCount,
        // Users list နဲ့ rule တစ်ခုတည်း — presence store မဟုတ်, lastSeenAt ကနေ တွက်။
        lastDevice: deviceInfo(owner.lastUserAgent),
        online: isOnline(owner),
      };
    }),
  );

  res.json({ owners: ownersWithStats });
});
