// Atlas connection စစ်ဆေးခြင်း helper
//   node scripts/check-mongo-connection.js
//
// အလုပ်လုပ်ပုံ: DNS (SRV + A record) နဲ့ TCP 27017 ကို စမ်းသပ်ပြီး
// ချက်ချင်းကို connect + query လုပ်ကြည့်ပါတယ်။
require("dotenv").config();
const net = require("net");
const mongoose = require("mongoose");
const { configureDns, resolveMongoUri } = require("../src/config/dns");

configureDns();

const rawUri = process.env.MONGODB_URI;

function tcpCheck(host, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect(port, host);
    socket.setTimeout(12000);
    socket.on("connect", () => {
      socket.end();
      resolve(`TCP OK (${Date.now() - started}ms)`);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve("TCP TIMEOUT");
    });
    socket.on("error", (err) => resolve(`TCP ERROR ${err.code}`));
  });
}

(async () => {
  console.log("URI:", rawUri.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@"));

  const direct = await resolveMongoUri(rawUri);
  const hosts = (direct.match(/@([^?]*)\?/)?.[1] || "").split(",").filter(Boolean);

  for (const host of hosts) {
    const name = host.split(":")[0];
    console.log(`  ${name.padEnd(48)} ${await tcpCheck(name, 27017)}`);
  }

  const started = Date.now();
  try {
    await mongoose.connect(direct, {
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 15000,
    });
    const info = await mongoose.connection.db.admin().command({ buildInfo: 1 });
    console.log(`\nDB CONNECTED (${Date.now() - started}ms) mongod ${info.version}`);
    console.log("db:", mongoose.connection.name);
    await mongoose.disconnect();
    console.log("RESULT: URL မှန်ကန်ပါသေးလား ✓");
  } catch (err) {
    console.log(`\nDB FAILED (${Date.now() - started}ms): ${String(err.message).slice(0, 200)}`);
    console.log(
      "\nဖြစ်နိုင်သော အကြောင်းများ:\n" +
        "  1) Atlas → Network Access → IP Access List ထဲမှာ လက်ရှိ public IP ရှိပါတယ်လား\n" +
        "  2) Router ကို reboot လုပ်ပါ (WAN IP ပြောင်းသွားနိုင်တယ်)\n" +
        "  3) Router DNS ကို 8.8.8.8 ပြောင်းပါ\n" +
        "  4) Mobile hotspot နဲ့ test လုပ်ပါ (ISP ပြဿနာဆိုရင်)",
    );
    process.exit(1);
  }
})();
