const dns = require("dns");
const { promisify } = require("util");

const resolveSrv = promisify(dns.resolveSrv);
const resolveTxt = promisify(dns.resolveTxt);

// မှတ်သားမှု: ဒီ network မှာ 1.1.1.1 က block ဖြစ်နေလို့ Google DNS (8.8.8.8) ကို ဦးစားပြုတယ်။
const PUBLIC_DNS = ["8.8.8.8", "9.9.9.9"];

function configureDns() {
  try {
    dns.setServers(
      (process.env.DNS_SERVERS || PUBLIC_DNS.join(","))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  } catch (err) {
    console.error(`Could not set DNS servers: ${err.message}`);
  }
}

// Atlas cluster က SRV + TXT lookup ကို အကြိမ်က လုပ်ရင် local DNS က မှားတတ်လို့
// resolve လုပ်ပြီး host တွေကို တိုက်ရိုက် URI အဖြစ် ပြောင်းပြီး cache ထားတယ်။
// ဒါကြောင့် DNS query နည်းနည်းသာ သုံးမယ်။
let cachedUri = null;

async function resolveMongoUri(uri) {
  if (cachedUri) return cachedUri;
  if (!uri || !uri.startsWith("mongodb+srv://")) return uri;

  const match = uri.match(
    /^mongodb\+srv:\/\/([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/,
  );

  if (!match) return uri;

  const [, credentials, host, path = "/", query = ""] = match;

  try {
    const srv = await resolveSrv(`_mongodb._tcp.${host}`);

    if (!srv || srv.length === 0) return uri;

    // SRV record name မှာ trailing dot ရှိတတ်လို့ ဖယ်ပြီးမှ သုံးမယ် (driver က host ကို အမှားပိုင်း ခွဲပေးတတ်တယ်)။
    const hosts = srv
      .map((record) => `${record.name.replace(/\.$/, "")}:${record.port}`)
      .join(",");
    const txt = await resolveTxt(`_mongodb._tcp.${host}`).catch(() => []);
    const options = txt.flat().find((value) => value.includes("=")) || "";

    const params = new URLSearchParams(query.replace(/^\?/, ""));

    if (options) {
      for (const [key, value] of new URLSearchParams(options)) {
        if (!params.has(key)) params.set(key, value);
      }
    }

    if (!params.has("tls")) params.set("tls", "true");

    const resolved = `mongodb://${credentials}@${hosts}${path}?${params.toString()}`;

    cachedUri = resolved;
    return resolved;
  } catch (err) {
    console.error(`SRV resolve failed, using the original URI: ${err.message}`);
    return uri;
  }
}

function resetMongoUriCache() {
  cachedUri = null;
}

module.exports = { configureDns, resolveMongoUri, resetMongoUriCache };
