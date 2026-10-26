const PLACEHOLDER_SECRETS = [
  "REPLACE_WITH_A_LONG_RANDOM_SECRET",
  "changeme",
  "secret",
  "your-secret",
];

// Production မှာ default/placeholder တွေကို သုံးမို့ server မစတင်ခင် တိုင်းစစ်ပါမယ်။
// မဟုတ်ရင် မည်သူမျိုးလည်း admin token ဖန်တီးနိုင်မယ်။
function assertEnv() {
  const problems = [];

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.trim().length < 32) {
    problems.push(
      "JWT_SECRET is missing or too short (minimum 32 characters required)",
    );
  } else if (
    PLACEHOLDER_SECRETS.some((placeholder) =>
      jwtSecret.toLowerCase().includes(placeholder.toLowerCase()),
    )
  ) {
    problems.push(
      "JWT_SECRET still contains a placeholder value — generate a random secret",
    );
  }

  if (!process.env.MONGODB_URI) {
    problems.push("MONGODB_URI is missing");
  }

  // CLIENT_ORIGIN မထည့်ရင် CORS က origin အားလုံးကို ပိတ်မယ် —
  // frontend က "Network error" ပဲပြပြီး cause မသိရလို့ boot မှာပဲ တားမယ်။
  const origins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    problems.push(
      "CLIENT_ORIGIN is missing — set the comma-separated frontend origins, e.g. https://app.up.railway.app,https://admin.up.railway.app",
    );
  } else if (
    origins.some((origin) => origin.startsWith("http://localhost")) &&
    process.env.NODE_ENV === "production"
  ) {
    problems.push("CLIENT_ORIGIN still contains a localhost origin in production");
  }

  const imageKitValues = [
    process.env.IMAGEKIT_PUBLIC_KEY,
    process.env.IMAGEKIT_PRIVATE_KEY,
    process.env.IMAGEKIT_URL_ENDPOINT,
  ];

  if (imageKitValues.some((value) => !value || !value.trim())) {
    problems.push(
      "IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT are required",
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid server configuration:\n - ${problems.join("\n - ")}`);
  }
}

module.exports = { assertEnv };
