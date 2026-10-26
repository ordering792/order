const crypto = require("crypto");
const User = require("../models/User");

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 8;

// Code တွေက downline နေရာချတဲ့ authorization material ဖြစ်လို့
// Math.random (predictable) မသုံးဘူး။
function generateInvitationCode() {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }

  return code;
}

// DB မှာ မတူတဲ့ code ရအောင် ထုတ်ပေးမယ်။
async function createUniqueCode(field) {
  let code = generateInvitationCode();

  // eslint-disable-next-line no-await-in-loop
  while (await User.findOne({ [field]: code })) {
    code = generateInvitationCode();
  }

  return code;
}

// ဖုန်းနံပါတ်/code ကနေ အဲဒီ user ရဲ့ owner ကို ရှာတယ်။
//   - owner ရဲ့ ownerInviteCode
//   - user/owner ရဲ့ invitationCode (အောက်က downline owner ကို ဆက်တယ်)
async function resolveInviteCode(code) {
  const owner = await User.findOne({
    ownerInviteCode: code,
    role: "owner",
    status: { $ne: "burned" },
  });

  if (owner) {
    return { ownerId: owner._id, resolvedCode: code };
  }

  const referrer = await User.findOne({
    invitationCode: code,
    status: { $ne: "burned" },
  });

  if (!referrer) return null;

  let ownerId = null;
  if (referrer.ownerId) {
    ownerId = referrer.ownerId;
  } else if (referrer.role === "owner") {
    ownerId = referrer._id;
  }

  return { ownerId, resolvedCode: code };
}

module.exports = {
  generateInvitationCode,
  createUniqueCode,
  resolveInviteCode,
};
