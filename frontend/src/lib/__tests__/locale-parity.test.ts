import { LANGS } from "../i18n";
import { dictionaries } from "../locales";

// ၉ ဘာသာ dictionary ကို လက်နဲ့ sync ထားရတာ — key/placeholder တစ်ခု လွဲရင်
// en fallback ဒါမှမဟုတ် screen ပေါ် raw key အဖြစ် ပေါ်လာပြီး dev ကိုယ်တိုင်
// မနှိပ်ကြည့်ရင် မသိနိုင်လို့ ဒီ test က CI မှာ စစ်မယ်။
const placeholders = (text: string) =>
  [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
    .map((match) => match[1])
    .sort();

const en = dictionaries.en;
const enKeys = Object.keys(en);
const nonEnglish = LANGS.filter((lang) => lang !== "en");

describe("locale dictionary parity", () => {
  it("provides a dictionary for every supported language", () => {
    expect(LANGS.filter((lang) => !dictionaries[lang])).toEqual([]);
  });

  it.each(nonEnglish)("%s carries every English key", (lang) => {
    const table = dictionaries[lang] ?? {};
    expect(enKeys.filter((key) => !(key in table))).toEqual([]);
  });

  it.each(nonEnglish)("%s adds no key English lacks", (lang) => {
    const table = dictionaries[lang] ?? {};
    expect(Object.keys(table).filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it.each(nonEnglish)("%s uses the same {placeholders} as English", (lang) => {
    const table = dictionaries[lang] ?? {};

    const mismatched = enKeys
      .filter((key) => {
        const value = table[key];
        return (
          typeof value === "string" &&
          placeholders(value).join(",") !== placeholders(en[key]).join(",")
        );
      })
      .map(
        (key) =>
          `${key}: en=${JSON.stringify(en[key])} ${lang}=${JSON.stringify(
            table[key],
          )}`,
      );

    expect(mismatched).toEqual([]);
  });

  it.each(nonEnglish)("%s has no empty translation", (lang) => {
    const table = dictionaries[lang] ?? {};
    expect(
      enKeys.filter(
        (key) => typeof table[key] === "string" && table[key].trim() === "",
      ),
    ).toEqual([]);
  });
});
