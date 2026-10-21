const mongoose = require("mongoose");
const { configureDns, resolveMongoUri } = require("./dns");

configureDns();

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  const uri = await resolveMongoUri(process.env.MONGODB_URI);
  let attempt = 0;

  // This network's Atlas reachability is intermittent (DNS + TCP timeouts),
  // so keep retrying instead of crashing the whole server on a transient blip.
  for (;;) {
    attempt += 1;

    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log("MongoDB Atlas connected");
      return;
    } catch (err) {
      console.error(
        `MongoDB connection attempt ${attempt} failed: ${err.message}`,
      );

      try {
        await mongoose.disconnect();
      } catch {
        // already disconnected
      }

      const delayMs = Math.min(5000 + (attempt - 1) * 1000, 15000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = connectDB;
