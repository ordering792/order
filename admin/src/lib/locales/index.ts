import type { Dict, Lang } from "../i18n";
import { authDict } from "./auth";
import { sharedDict } from "./shared";
import { adminDict } from "./admin";
import { adminUiDict } from "./adminUi";
import { adminOrdersDict } from "./adminOrders";

const features: Dict[] = [
  authDict,
  sharedDict,
  adminDict,
  adminUiDict,
  adminOrdersDict,
];

const LANG_LIST: Lang[] = ["en", "es", "pt", "ar", "hi", "ja", "th", "ko", "zh"];

export const dictionaries: Record<Lang, Record<string, string>> = LANG_LIST.reduce(
  (acc, l) => {
    acc[l] = {};
    return acc;
  },
  {} as Record<Lang, Record<string, string>>,
);

for (const feature of features) {
  for (const [lang, entries] of Object.entries(feature)) {
    const target = dictionaries[lang as Lang];
    if (target && entries) Object.assign(target, entries);
  }
}
