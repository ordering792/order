// Order အရေးကြီး: Edge/Opera/SamsungBrowser UA မှာ "Chrome" ပါတယ်,
// iOS Chrome မှာ "CriOS" ပါတယ် — အထူး brand ကို အရင်စစ်ရမယ်။
const BROWSERS = [
  [/EdgA?\/[\d.]+/, "Edge"],
  [/OPR\/[\d.]+/, "Opera"],
  [/SamsungBrowser\/[\d.]+/, "Samsung Internet"],
  [/Firefox\/[\d.]+/, "Firefox"],
  [/CriOS\/[\d.]+/, "Chrome"],
  [/Chrome\/[\d.]+/, "Chrome"],
  [/Version\/[\d.]+.*Safari/, "Safari"],
];

const PLATFORMS = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Windows NT/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

function firstMatch(rules, userAgent) {
  const hit = rules.find(([pattern]) => pattern.test(userAgent));
  return hit ? hit[1] : null;
}

// "Mozilla/5.0 (Linux; Android 13 ...) Chrome/120 Safari" -> "Chrome · Android"
function deviceInfo(userAgent) {
  if (typeof userAgent !== "string" || !userAgent.trim()) return null;

  const label = [firstMatch(BROWSERS, userAgent), firstMatch(PLATFORMS, userAgent)]
    .filter(Boolean)
    .join(" · ");

  return label || "Unknown";
}

module.exports = { deviceInfo };
