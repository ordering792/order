const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English (United States)", flag: "🇺🇸", dir: "ltr" },
  { code: "es", name: "Español (Spain)", flag: "🇪🇸", dir: "ltr" },
  { code: "pt", name: "Português (Brazil)", flag: "🇧🇷", dir: "ltr" },
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "hi", name: "हिन्दी (India)", flag: "🇮🇳", dir: "ltr" },
  { code: "ja", name: "日本語", flag: "🇯🇵", dir: "ltr" },
  { code: "th", name: "ไทย", flag: "🇹🇭", dir: "ltr" },
  { code: "ko", name: "한국어", flag: "🇰🇷", dir: "ltr" },
  { code: "zh", name: "中文 (China)", flag: "🇨🇳", dir: "ltr" },
];

const DEFAULT_LANGUAGE = "en";

function isSupportedLanguage(code) {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

function getLanguageDirection(code) {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang ? lang.dir : "ltr";
}

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  getLanguageDirection,
};
