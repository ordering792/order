const crypto = require("crypto");
const { z } = require("zod");

const purposeSchema = z.enum(["product", "deposit-proof"]);
const AUTH_TTL_SECONDS = 10 * 60;

function getImageKitConfig() {
  return {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  };
}

function getUploadFolder(purpose) {
  return purpose === "product" ? "/products" : "/deposit-proofs";
}

exports.authorize = (req, res) => {
  const parsed = purposeSchema.safeParse(req.query.purpose);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid upload purpose" });
  }

  if (parsed.data === "product" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { publicKey, privateKey, urlEndpoint } = getImageKitConfig();

  if (!publicKey || !privateKey || !urlEndpoint) {
    return res.status(503).json({ message: "Image upload is not configured" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expire = Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS;
  const signature = crypto
    .createHmac("sha1", privateKey)
    .update(`${token}${expire}`)
    .digest("hex");

  return res.json({
    token,
    expire,
    signature,
    publicKey,
    urlEndpoint,
    folder: getUploadFolder(parsed.data),
  });
};

exports.isImageKitUrl = (value) => {
  if (typeof value !== "string" || value.length > 1000) return false;

  try {
    const url = new URL(value);
    const configuredEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
    const endpointHost = configuredEndpoint
      ? new URL(configuredEndpoint).hostname
      : null;

    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".imagekit.io") &&
      (!endpointHost || url.hostname === endpointHost)
    );
  } catch {
    return false;
  }
};
