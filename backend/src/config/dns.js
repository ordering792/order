const dns = require("dns");

// ဒီ network မှာ router DNS (192.168.100.1) က မောင်းပိုင်း မလုပ်တော့လို့
// public DNS (Google) ကိုပဲ သုံးမယ်။ မှတ်သားမှု: 1.1.1.1 က ဒီ network မှာ block ဖြစ်နေလို့ 8.8.8.8 ကို ဦးစားပြုတယ်။
const PUBLIC_DNS = ["8.8.8.8", "9.9.9.9"];

const cnameResolver = new dns.promises.Resolver();
cnameResolver.setServers(PUBLIC_DNS);

const originalLookup = dns.lookup.bind(dns);

function resolveViaPublicDns(hostname, options) {
  const wantsAll = Boolean(options?.all);
  const family = options?.family;

  const query =
    family === 6
      ? cnameResolver.resolve6(hostname)
      : cnameResolver.resolve4(hostname);

  return query.then((addresses) => {
    if (!wantsAll) {
      return [{ address: addresses[0], family: family === 6 ? 6 : 4 }];
    }

    return addresses.map((address) => ({
      address,
      family: family === 6 ? 6 : 4,
    }));
  });
}

// Node ရဲ့ dns.lookup() က OS resolver (router DNS) ကို သုံးတယ်။ MongoDB driver က A record ကို
// lookup() နဲ့ရှာတာမို့ OS DNS မလုပ်ရင် connect မဖြစ်ဘူး။
// ဒါကြောင့် lookup ကို public DNS (c-ares) နဲ့ ကျွောင်းပေးထားတယ် —
// hostname က မပြောင်းလို့ TLS certificate ကလည်း မှန်အလုပ်လုပ်မယ်။
function patchLookup() {
  dns.lookup = function patchedLookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    resolveViaPublicDns(hostname, options)
      .then((results) => {
        if (options?.all) {
          callback(null, results);
          return;
        }

        callback(null, results[0].address, results[0].family);
      })
      .catch(() => {
        // public DNS က မလုပ်ရင် OS resolver ကို ပြန်ကြိုးစားမယ်။
        originalLookup(hostname, options, callback);
      });
  };
}

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

  patchLookup();
}

// mongodb+srv:// URI က driver က SRV + TXT lookup နှစ်ခုလုံး လုပ်ပြီး ဒီ network မှာ TXT
// lookup က အလွန်ကြား timeout ဖြစ်လို့ server selection မှန်ကန် မအောင်မြင်ဘူး။
// ဒါကြောင့် SRV host တွေကို ကိုယ်တိုင် resolve လုပ်ပြီး direct URI အဖြစ် ပြောင်းပေးမယ်။
// (replicaSet ကို driver က server ဆီမှ hello ပို့ပြီး ကိုယ်တိုင် discover လုပ်တယ်)
async function resolveMongoUri(uri) {
  if (!uri || !uri.startsWith("mongodb+srv://")) return uri;

  const match = uri.match(
    /^mongodb\+srv:\/\/([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/,
  );

  if (!match) return uri;

  const [, credentials, host, path = "/", query = ""] = match;

  try {
    const records = await cnameResolver.resolveSrv(
      `_mongodb._tcp.${host}`,
    );

    if (!records || records.length === 0) return uri;

    const hosts = records
      .map((record) => `${record.name.replace(/\.$/, "")}:${record.port}`)
      .join(",");

    const params = new URLSearchParams(query.replace(/^\?/, ""));
    if (!params.has("tls")) params.set("tls", "true");
    if (!params.has("authSource")) params.set("authSource", "admin");

    return `mongodb://${credentials}@${hosts}${path}?${params.toString()}`;
  } catch (err) {
    console.error(`SRV resolve failed, using the original URI: ${err.message}`);
    return uri;
  }
}

module.exports = { configureDns, resolveMongoUri, PUBLIC_DNS };
