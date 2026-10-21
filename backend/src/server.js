require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/database");
const { assertEnv } = require("./config/env");
const { setupSocket } = require("./socket");

const PORT = process.env.PORT || 5000;

async function start() {
  assertEnv();

  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const io = setupSocket(server);
  global.__IO__ = io;

  const shutdown = () => {
    io.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start();
