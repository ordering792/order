"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, getStoredUser } from "./api";
import { dictionaries } from "./locales";
import {
  DEFAULT_LANG,
  flagCode,
  getStoredLang,
  langCode,
  storeLang,
  type LangSelection,
} from "./language";

export type Lang = "en" | "es" | "pt" | "ar" | "hi" | "ja" | "th" | "ko" | "zh";

export const LANGS: readonly Lang[] = [
  "en",
  "es",
  "pt",
  "ar",
  "hi",
  "ja",
  "th",
  "ko",
  "zh",
];

export type Dict = Partial<Record<Lang, Record<string, string>>>;

const LANG_NAMES: Record<Lang, string> = {
  en: "English (United States)",
  es: "Español (Spain)",
  pt: "Português (Brazil)",
  ar: "العربية",
  hi: "हिन्दी (India)",
  ja: "日本語",
  th: "ไทย (Thailand)",
  ko: "한국어 (Korea)",
  zh: "中文 (China)",
};

function toLang(code: string): Lang {
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : "en";
}

function hasStoredLang(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("language") !== null;
}

interface LanguageContextValue {
  lang: Lang;
  selection: LangSelection;
  select: (selection: LangSelection) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<LangSelection>(DEFAULT_LANG);

  useEffect(() => {
    if (hasStoredLang()) {
      setSelection(getStoredLang());
      return;
    }
    const stored = getStoredUser();
    if (stored?.language && (LANGS as readonly string[]).includes(stored.language)) {
      const code = stored.language as Lang;
      setSelection({ name: LANG_NAMES[code], code: flagCode(code) });
    }
  }, []);

  const lang = useMemo(() => toLang(langCode(selection.code)), [selection.code]);

  const select = useCallback((sel: LangSelection) => {
    setSelection(sel);
    storeLang(sel);
    api.updateLanguage(langCode(sel.code)).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = "ltr";
  }, [lang]);

  const value = useMemo(
    () => ({ lang, selection, select }),
    [lang, selection, select],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useT(dict?: Dict) {
  const { lang } = useLanguage();
  const d = dict ?? dictionaries;
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = d[lang]?.[key] ?? d.en?.[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.split(`{${k}}`).join(String(v));
        }
      }
      return text;
    },
    [d, lang],
  );
}
