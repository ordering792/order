require("dotenv").config();
const dns = require("dns");
const { configureDns } = require("../src/config/dns");

configureDns();

function timed(label, fn) {
  const started = Date.now();
  return new Promise((resolve) => {
    fn((err, value) => {
      console.log(
        `${label}: ${err ? err.code : JSON.stringify(value).slice(0, 110)} (${Date.now() - started}ms)`,
      );
      resolve();
    });
  });
}

(async () => {
  await timed("resolveSrv (c-ares 8.8.8.8)", (cb) =>
    dns.resolveSrv("_mongodb._tcp.cluster0.veyvoqi.mongodb.net", (e, r) =>
      cb(e, r && r.map((x) => `${x.name}:${x.port}`)),
    ),
  );

  await timed("resolveTxt (c-ares 8.8.8.8)", (cb) =>
    dns.resolveTxt("_mongodb._tcp.cluster0.veyvoqi.mongodb.net", (e, r) => cb(e, r)),
  );

  await timed("lookup (patched)", (cb) => dns.lookup("cluster0.veyvoqi.mongodb.net", cb));

  await timed("resolve4 (c-ares)", (cb) =>
    dns.resolve4("ac-3gzuduc-shard-00-00.veyvoqi.mongodb.net", cb),
  );

  // what the driver actually uses
  await timed("lookup shard (patched)", (cb) =>
    dns.lookup("ac-3gzuduc-shard-00-00.veyvoqi.mongodb.net", cb),
  );
})();
