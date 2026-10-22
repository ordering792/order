export interface LangSelection {
  name: string;
  code: string;
}

const FLAG_BY_LANG: Record<string, string> = {
  en: "us",
  es: "es",
  pt: "br",
  ar: "sa",
  hi: "in",
  ja: "jp",
  th: "th",
  ko: "kr",
  zh: "cn",
};

const LANG_BY_FLAG: Record<string, string> = Object.fromEntries(
  Object.entries(FLAG_BY_LANG).map(([lang, flag]) => [flag, lang]),
);

export const DEFAULT_LANG: LangSelection = {
  name: "English (United States)",
  code: "us",
};

export function flagCode(langCode: string): string {
  return FLAG_BY_LANG[langCode] ?? langCode;
}

export function langCode(flag: string): string {
  return LANG_BY_FLAG[flag] ?? flag;
}

export function getStoredLang(): LangSelection {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const raw = localStorage.getItem("language");
    if (!raw) return DEFAULT_LANG;
    const parsed = JSON.parse(raw) as LangSelection;
    return parsed.code ? parsed : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export function storeLang(selection: LangSelection) {
  if (typeof window === "undefined") return;
  localStorage.setItem("language", JSON.stringify(selection));
}
