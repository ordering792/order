const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Presence stamp ကို request တိုင်း မရေးဘူး — user တစ်ယောက်ကို ၆၀ စက္ကန့်တွင်း
// တစ်ခါပဲ။ Admin list ရဲ့ online window (၅ မိနစ်) ထက် အများကြီး တိုတယ်။
const SEEN_THROTTLE_MS = 60_000;

function stampLastSeen(user) {
  const seenAt = user.lastSeenAt?.getTime() ?? 0;

  if (Date.now() - seenAt <= SEEN_THROTTLE_MS) return;

  // await မလုပ်ဘူး — auth path ကို blocking မလုပ်ချင်ဘူး။ Floating promise ဖြစ်တဲ့
  // အတွက် rejection ကို ဒီမှာပဲ စားမယ် (process မ crash အောင်)။
  User.updateOne(
    { _id: user._id },
    { $set: { lastSeenAt: new Date() } },
  ).catch(() => {});
}

// Admin reset ပြီးသား token ကို ငြင်းပယ်မယ်။ Deploy မတိုင်မီ issued token တွေ
// မှာ tv မပါလို့ 0 အဖြစ် သတ်မှတ်တယ် — ဒါမှ release တစ်ခါနဲ့ အားလုံး logout မဖြစ်ဘူး။
function isTokenStale(payload, user) {
  return (payload.tv ?? 0) !== (user.tokenVersion ?? 0);
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.userId).select(
      "_id role status phone name invitationCode tokenVersion licenseAcceptedAt lastSeenAt",
    );

    if (!user || user.status === "burned") {
      return res.status(401).json({
        message: "Account unavailable",
      });
    }

    if (isTokenStale(payload, user)) {
      return res.status(401).json({
        message: "Session expired. Please sign in again.",
      });
    }

    stampLastSeen(user);

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

// Agreement လက်မှတ် မထိုးရသေးသူကို order grab / task submit မလုပ်ခိုင်းဘူး။
// Frontend redirect ကို URL တိုက်ရိုက်ဝင်ကျော်တာ ရှိလို့ တကယ့် အတားအဆီးက ဒီနေရာ။
function requireLicense(req, res, next) {
  if (["admin", "owner"].includes(req.user?.role)) return next();

  if (!req.user?.licenseAcceptedAt) {
    return res.status(403).json({
      message: "User agreement acceptance required",
    });
  }

  next();
}

function adminOnly(req, res, next) {  if (req.user?.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
}

function ownerOnly(req, res, next) {
  if (req.user?.role !== "owner" && req.user?.role !== "admin") {
    return res.status(403).json({
      message: "Owner access required",
    });
  }

  next();
}

function adminOrOwner(req, res, next) {
  if (!["admin", "owner"].includes(req.user?.role)) {
    return res.status(403).json({
      message: "Owner or admin access required",
    });
  }

  next();
}

module.exports = {
  auth,
  requireLicense,
  adminOnly,
  ownerOnly,
  adminOrOwner,
  isTokenStale,
};
