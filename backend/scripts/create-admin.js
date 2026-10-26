require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const connectDB = require("../src/config/database");
const { createUniqueCode } = require("../src/services/inviteService");

// Admin credential ကို code ထဲမှာ မရှိစေဘူး။
//   ADMIN_PHONE / ADMIN_PASSWORD / ADMIN_NAME (env သို့ CLI arg) နဲ့ ပေးရမယ်။
//   Password မပေးရင် ချက်ချင်း random ဖန်တီးပြီး တစ်ခါတည်း ပြသောမယ်။
function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const phone = (argValue("--phone") || process.env.ADMIN_PHONE || "").trim();
const name = (argValue("--name") || process.env.ADMIN_NAME || "Admin User").trim();
const providedPassword = (argValue("--password") || process.env.ADMIN_PASSWORD || "").trim();

if (!phone) {
  console.error(
    "Phone number required: pass --phone 09xxxxxxxxx or set ADMIN_PHONE in .env",
  );
  process.exit(1);
}

async function createAdmin() {
  await connectDB();

  // Model အစစ်ကို သုံးတယ် — inline schema ဆံသတ်ရင် inviteService က
  // User ကို compile လုပ်ပြီးသားဖြစ်လို့ OverwriteModelError ထွက်တယ်။
  const User = require("../src/models/User");

  const existing = await User.findOne({ phone });

  if (existing) {
    console.log("Admin already exists:");
    console.log("  Phone:", existing.phone);
    console.log("  Role:", existing.role);
    console.log("  Invitation Code:", existing.invitationCode);
    await mongoose.disconnect();
    return;
  }

  const password = providedPassword || crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await User.create({
    name,
    phone,
    passwordHash,
    invitationCode: await createUniqueCode("invitationCode"),
    role: "admin",
  });

  console.log("Admin created successfully:");
  console.log("  Phone:", admin.phone);
  console.log("  Role:", admin.role);
  console.log("  Invitation Code:", admin.invitationCode);
  console.log("  Password:", password);
  console.log("  (save it now — it is not stored in plain text anywhere)");

  await mongoose.disconnect();
}

createAdmin().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
