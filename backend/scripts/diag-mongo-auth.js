require("dotenv").config();
const mongoose = require("mongoose");
const { configureDns, resolveMongoUri } = require("../src/config/dns");

configureDns();

(async () => {
  const direct = await resolveMongoUri(process.env.MONGODB_URI);
  const creds = direct.match(/mongodb:\/\/([^@]+)@/)[1];
  const hosts = direct.match(/@([^?]*)\?/)[1].split(",");

  const variants = [
    { name: "single host, directConnection", uri: `mongodb://${creds}@${hosts[0]}/?tls=true&authSource=admin&directConnection=true` },
    { name: "single host + replicaSet", uri: `mongodb://${creds}@${hosts[0]}/?tls=true&authSource=admin&directConnection=true&replicaSet=atlas-rfg3o5-shard-0` },
    { name: "all hosts", uri: `mongodb://${creds}@${hosts.join(",")}/?tls=true&authSource=admin` },
    { name: "all hosts + replicaSet", uri: `mongodb://${creds}@${hosts.join(",")}/?tls=true&authSource=admin&replicaSet=atlas-rfg3o5-shard-0` },
  ];

  for (const variant of variants) {
    const started = Date.now();
    const conn = mongoose.createConnection(variant.uri, {
      serverSelectionTimeoutMS: 12000,
      connectTimeoutMS: 10000,
    });

    try {
      await conn.asPromise();
      const hello = await conn.db.admin().command({ hello: 1 });
      console.log(`OK   [${variant.name}] ${Date.now() - started}ms setName=${hello.setName}`);
      await conn.close();
    } catch (err) {
      console.log(`FAIL [${variant.name}] ${Date.now() - started}ms`);
      console.log(`     code=${err.code ?? "-"} labels=${err.errorLabels?.join(",") ?? "-"}`);
      console.log(`     msg=${String(err.message).slice(0, 200)}`);
      if (err.reason) console.log("     reason=" + JSON.stringify(err.reason).slice(0, 600));
    }
  }

  await mongoose.disconnect().catch(() => {});
})();
