import {
  flagCode,
  langCode,
  DEFAULT_LANG,
  getStoredLang,
  storeLang,
} from "../language";

describe("language helpers", () => {
  describe("flagCode", () => {
    it("maps language codes to flag codes", () => {
      expect(flagCode("en")).toBe("us");
      expect(flagCode("es")).toBe("es");
      expect(flagCode("pt")).toBe("br");
      expect(flagCode("ar")).toBe("sa");
      expect(flagCode("hi")).toBe("in");
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
      expect(langCode("jp")).toBe("ja");
      expect(langCode("cn")).toBe("zh");
    });

    it("falls back to input for unknown flags", () => {
      expect(langCode("xx")).toBe("xx");
      expect(langCode("")).toBe("");
    });
  });

  describe("round-trip mapping", () => {
    const langs = ["en", "es", "pt", "ar", "hi", "ja", "th", "ko", "zh"];

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
