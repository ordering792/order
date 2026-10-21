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

  if (problems.length > 0) {
    throw new Error(`Invalid server configuration:\n - ${problems.join("\n - ")}`);
  }
}

module.exports = { assertEnv };
