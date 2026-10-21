const mongoose = require("mongoose");

module.exports = async () => {
  await mongoose.disconnect();

  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
};
