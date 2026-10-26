const crypto = require("crypto");
require("dotenv").config();

const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

const token = crypto.randomBytes(24).toString("hex");
const expire = Math.floor(Date.now() / 1000) + 600;
const signature = crypto
  .createHmac("sha1", privateKey)
  .update(token + expire)
  .digest("hex");

console.log("IMAGEKIT UPLOAD AUTH PARAMS:");
console.log("---");
console.log("url:", "https://upload.imagekit.io/api/v1/files/upload");
console.log("publicKey:", publicKey);
console.log("signature:", signature);
console.log("expire:", expire);
console.log("token:", token);
console.log("useUniqueFileName:", "true");
console.log("folder:", "/products");
console.log("urlEndpoint:", urlEndpoint);
