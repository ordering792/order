import { existsSync } from "fs";
import { join } from "path";
import {
  flagCode,
  langCode,
  DEFAULT_LANG,
  getStoredLang,
  storeLang,
} from "../language";
import { LANGS } from "../i18n";

describe("language helpers", () => {
  describe("flagCode", () => {
    it("maps language codes to flag codes", () => {
      expect(flagCode("en")).toBe("us");
      expect(flagCode("es")).toBe("es");
      expect(flagCode("pt")).toBe("br");
      expect(flagCode("ar")).toBe("sa");
      expect(flagCode("ur")).toBe("pk");
      expect(flagCode("ja")).toBe("jp");
      expect(flagCode("th")).toBe("th");
      expect(flagCode("ko")).toBe("kr");
      expect(flagCode("zh")).toBe("cn");
    });

    it("falls back to input for unknown codes", () => {
      expect(flagCode("xx")).toBe("xx");
      expect(flagCode("")).toBe("");
    });
  });

  describe("langCode", () => {
    it("maps flag codes back to language codes", () => {
      expect(langCode("us")).toBe("en");
      expect(langCode("br")).toBe("pt");
      expect(langCode("sa")).toBe("ar");
      expect(langCode("pk")).toBe("ur");
      expect(langCode("jp")).toBe("ja");
      expect(langCode("cn")).toBe("zh");
    });

    it("falls back to input for unknown flags", () => {
      expect(langCode("xx")).toBe("xx");
      expect(langCode("")).toBe("");
    });
  });

  describe("round-trip mapping", () => {
    const langs = ["en", "es", "pt", "ar", "ur", "ja", "th", "ko", "zh"];

    langs.forEach((lang) => {
      it(`langCode(flagCode("${lang}")) === "${lang}"`, () => {
        expect(langCode(flagCode(lang))).toBe(lang);
      });
    });
  });

  describe("getStoredLang", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("returns DEFAULT_LANG when nothing stored", () => {
      expect(getStoredLang()).toEqual(DEFAULT_LANG);
    });

    it("returns parsed stored value", () => {
      localStorage.setItem(
        "language",
        JSON.stringify({ name: "Español", code: "es" })
      );
      expect(getStoredLang()).toEqual({ name: "Español", code: "es" });
    });

    it("returns DEFAULT_LANG for malformed stored value", () => {
      localStorage.setItem("language", "not-json");
      expect(getStoredLang()).toEqual(DEFAULT_LANG);
    });

    it("returns DEFAULT_LANG when stored value lacks code", () => {
      localStorage.setItem("language", JSON.stringify({ name: "English" }));
      expect(getStoredLang()).toEqual(DEFAULT_LANG);
    });
  });

  describe("storeLang", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("stores selection to localStorage", () => {
      const sel = { name: "Español", code: "es" };
      storeLang(sel);
      expect(JSON.parse(localStorage.getItem("language") || "")).toEqual(sel);
    });
  });
});

// ဘာသာစကား စာရင်းကို backend က စတယ် — picker က /auth/languages ကို ခေါ်တယ်။
// LANGS က backend/src/config/languages.js နဲ့ ကွဲသွားရင် ရွေးလို့ရတဲ့ ဘာသာစကားက
// dictionary မရှိဘဲ key အလွတ် ပြန်တယ်။
const backendLanguages = join(
  process.cwd(),
  "..",
  "backend",
  "src",
  "config",
  "languages.js",
);

const compareWithBackend = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SUPPORTED_LANGUAGES } = require(backendLanguages) as {
    SUPPORTED_LANGUAGES: { code: string }[];
  };

  it("offers exactly the languages the backend supports", () => {
    expect([...LANGS].sort()).toEqual(
      SUPPORTED_LANGUAGES.map((lang) => lang.code).sort(),
    );
  });
};

if (existsSync(backendLanguages)) {
  describe("backend language config parity", compareWithBackend);
} else if (process.env.CI) {
  // CI က monorepo တစ်ခုလုံးကို checkout လုပ်တာ — backend မတွေ့ရင် checkout
  // မှားနေပြီ။ skip ခွင့်ပေးရင် guard အလုပ်မလုပ်တော့ဘူး။
  describe("backend language config parity", () => {
    it("finds the backend inside the monorepo checkout", () => {
      throw new Error(
        `No backend/ next to ${process.cwd()} — the language parity guard cannot verify anything.`,
      );
    });
  });
} else {
  // Docker build context ထဲမှာ app တစ်ခုတည်းပဲ ရှိတယ် — local/Docker ဆို skip။
  describe.skip("backend language config parity", compareWithBackend);
}
