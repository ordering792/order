const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { normalizePhone, normalizePassword } = require("../utils/phone");
const { signToken } = require("../utils/token");
const {
  createUniqueCode,
  resolveInviteCode,
} = require("../services/inviteService");
const {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
} = require("../config/languages");
const { DEFAULT_INVITATION_CODE } = require("../config/invitation");

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(20),
  password: z.string().min(6).max(100),
  invitationCode: z.string().min(4).max(20),
  referredByCode: z.string().max(20).optional(),
});

const loginSchema = z.object({
  phone: z.string().min(5).max(20),
  password: z.string().min(1).max(100),
});

const updateLanguageSchema = z.object({
  language: z.string().min(2).max(5),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    invitationCode: user.invitationCode,
    role: user.role,
    language: user.language || DEFAULT_LANGUAGE,
    licenseAcceptedAt: user.licenseAcceptedAt || null,
  };
}

exports.register = asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { name, invitationCode, referredByCode } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  const password = normalizePassword(parsed.data.password);

  const existing = await User.findOne({ phone });

  if (existing) {
    return res.status(409).json({
      message: "Phone number already registered",
    });
  }

  // Resolve hierarchy: which owner does this user belong to?
  // Accept either referredByCode, or a real user/owner code typed into
  // the invitationCode field (only MASTER default is allowed otherwise).
  let ownerId = null;
  let resolvedReferredByCode = null;

  const referralCode =
    referredByCode ||
    (invitationCode !== DEFAULT_INVITATION_CODE ? invitationCode : null);

  if (referralCode) {
    const resolved = await resolveInviteCode(referralCode);

    if (!resolved) {
      return res.status(400).json({
        message: "Invalid invitation code",
      });
    }

    ownerId = resolved.ownerId;
    resolvedReferredByCode = resolved.resolvedCode;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    phone,
    passwordHash,
    invitationCode: await createUniqueCode("invitationCode"),
    referredByCode: resolvedReferredByCode,
    ownerId,
  });

  res.status(201).json({
    token: signToken(user),
    user: {
      ...publicUser(user),
      ownerId: user.ownerId ? String(user.ownerId) : null,
    },
  });
});

// Login surface — customer app နဲ့ admin panel က /auth/login တစ်ခုတည်းကို မျှသုံးနေလို့
// ဘယ် app ကနေ ဝင်တာလဲ backend က သိခွင့်မရှိ။ ဒါကြောင့် surface အလိုက် route ခွဲထားတယ်:
// /auth/login = customer (role=user သား), /auth/staff-login = panel (admin|owner သား)။
// Gate ကို password အောင်မြင်ပြီးမှ စစ်တယ် — password မှားနေသူဆီ "ဒီဖုန်းနံပါတ်က
// staff account" ဆိုတဲ့ အချက် မရောက်အောင်။
const LOGIN_SURFACES = {
  customer: {
    roles: ["user"],
    refusal: "This account signs in from the admin panel.",
  },
  staff: {
    roles: ["admin", "owner"],
    refusal: "This account signs in from the customer app.",
  },
};

function performLogin(surface) {
  return asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.issues,
      });
    }

    const phone = normalizePhone(parsed.data.phone);
    const password = normalizePassword(parsed.data.password);

    const user = await User.findOne({ phone }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        message: "Invalid phone or password",
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({
        message: "Invalid phone or password",
      });
    }

    // Burned account ကို login မှာပဲ ပိတ်တယ် — token မထုတ်ဘူး။ Password အောင်မြင်ပြီးမှ
    // ဖြေတယ်: စကားဝှက်မှားနေသူဆီ "ဒီအကောင့် ပိတ်ထားတယ်" ဆိုတဲ့ သတင်း မရောက်အောင်။
    // (auth middleware ကလည်း ဒီ status ကိုပဲ စစ်တယ် — ဒါက အစောပိုင်း တံခါး။)
    // Burn က surface ထက် အရင် — ပိတ်ထားတဲ့ account ရဲ့ ကြောင်းကြည့်သူကို အကြောင်း
    // အရင်း "app မှားတယ်" လို့ မလွှဲပြောင်းပြဘူး။
    if (user.status === "burned") {
      return res.status(403).json({
        message: "This account has been deactivated. Please contact support.",
      });
    }

    // 409 = အကောင့်ရှိပြီး password လည်းမှန်, ဒါပေမဲ့ ဒီ app အတွက် မဟုတ်။ 403 (burn) နဲ့
    // status ခွဲထားတယ် — client က ဘယ်စာသားပြရမလဲ ရွေးနိုင်အောင်။ 401 ကို မသုံးဘူး:
    // client.ts က session ကို ရှင်းလိုက်မယ်။
    if (!LOGIN_SURFACES[surface].roles.includes(user.role)) {
      return res.status(409).json({
        message: LOGIN_SURFACES[surface].refusal,
      });
    }

    // Admin user list မှာ IP/device ပြနိုင်အောင် login အောင်မြင်တိုင်း မှတ်ထားမယ်။
    // App မှားဝင်တဲ့ကြိမ်ကို lastLoginAt မမှတ်ဘူး — panel မှာ "ဒီ staff က customer app
    // ကနေ ဝင်ဖို့ကြိုးစားတယ်" လို့ မှားဖတ်ရမှာစိုးလို့။
    user.ipAddress = req.ip || null;
    user.lastLoginAt = new Date();
    user.lastUserAgent = (req.headers["user-agent"] || "").slice(0, 300) || null;
    await user.save();

    res.json({ token: signToken(user), user: publicUser(user) });
  });
}

exports.login = performLogin("customer");
exports.staffLogin = performLogin("staff");

exports.me = asyncHandler(async (req, res) => {
  const fullUser = await User.findById(req.user._id).select(
    "balance walletAddress licenseAcceptedAt",
  );

  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      phone: req.user.phone,
      invitationCode: req.user.invitationCode,
      role: req.user.role,
      status: req.user.status,
      language: req.user.language || DEFAULT_LANGUAGE,
      balance: fullUser?.balance ? fullUser.balance.toString() : "0.00",
      walletAddress: fullUser?.walletAddress || null,
      licenseAcceptedAt: fullUser?.licenseAcceptedAt || null,
    },
  });
});

exports.acceptLicense = asyncHandler(async (req, res) => {
  // ပထမ အကြိမ်ကိုပဲ မှတ်တယ် — ထပ်ခေါ်ရင် မူလ timestamp/IP ကို မပြောင်းဘူး။
  const accepted = await User.findOneAndUpdate(
    { _id: req.user._id, licenseAcceptedAt: null },
    {
      licenseAcceptedAt: new Date(),
      licenseIpAddress: req.ip || null,
      licenseUserAgent: (req.headers["user-agent"] || "").slice(0, 300) || null,
    },
    { returnDocument: "after", projection: { licenseAcceptedAt: 1 } },
  );

  if (accepted) {
    return res.json({ licenseAcceptedAt: accepted.licenseAcceptedAt });
  }

  const existing = await User.findById(req.user._id).select(
    "licenseAcceptedAt",
  );

  res.json({ licenseAcceptedAt: existing?.licenseAcceptedAt || null });
});

exports.updateLanguage = asyncHandler(async (req, res) => {
  const parsed = updateLanguageSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { language } = parsed.data;

  if (!isSupportedLanguage(language)) {
    return res.status(400).json({
      message: "Unsupported language",
      supportedLanguages: SUPPORTED_LANGUAGES.map((l) => l.code),
    });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { language },
    { returnDocument: "after" },
  );

  res.json({
    user: {
      id: user._id,
      language: user.language,
    },
  });
});

exports.getLanguages = asyncHandler(async (req, res) => {
  res.json({ languages: SUPPORTED_LANGUAGES });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  // register/login နှစ်ခုလုံး normalizePassword သုံးထားလို့ ဒီမှာ မလုပ်ရင်
  // old password mismatch (400) သို့မဟုတ် ပြောင်းပြီးနောက် login မရတဲ့
  // silent lockout ဖြစ်တယ်။ trim ပြီးမှ ပြန်စစ်မယ်။
  const normalized = changePasswordSchema.safeParse({
    oldPassword: normalizePassword(parsed.data.oldPassword),
    newPassword: normalizePassword(parsed.data.newPassword),
  });

  if (!normalized.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: normalized.error.issues,
    });
  }

  const { oldPassword, newPassword } = normalized.data;

  const user = await User.findById(req.user._id).select("+passwordHash");

  if (!user) {
    return res.status(409).json({ message: "User unavailable" });
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);

  if (!valid) {
    return res.status(400).json({ message: "Old password is incorrect" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ message: "Password updated" });
});
