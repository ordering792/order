import { existsSync, readFileSync } from "fs";
import { join } from "path";

// frontend/ နဲ့ admin/ က ဒီ module တွေကို copy အဖြစ် ထားတယ်။
// Railway/Docker က build context အတွင်း app တစ်ခုတည်းကိုပဲ copy နိုင်သေးလို့
// workspace package အဖြစ် မခွဲရသေး — ဒါကြောင့် copy နှစ်ခု တစ်ပုံစံတည်း
// ရှိနေမရှိ အရင်စစ်ထားတယ်။ (ပြင်တဲ့အခါ နှစ်ခုလုံးကို တစ်ချိန်တည်း ပြင်ပါ။)
const SHARED_FILES = [
  "src/lib/api/client.ts",
  "src/lib/auth.tsx",
  "src/lib/language.ts",
  "src/lib/money.ts",
  "src/lib/uploadImage.ts",
  "src/lib/__tests__/api-client.test.ts",
  "src/lib/__tests__/money.test.ts",
  "src/lib/__tests__/shared-files.test.ts",
];

const appRoot = process.cwd();
const sibling = ["admin", "frontend"]
  .map((name) => join(appRoot, "..", name))
  .find((dir) => dir !== appRoot && existsSync(join(dir, "package.json")));

const describeSibling = sibling ? describe : describe.skip;

describeSibling("frontend/admin shared copies", () => {
  it.each(SHARED_FILES)("keeps %s byte-identical", (relativePath) => {
    const here = readFileSync(join(appRoot, relativePath), "utf8");
    const there = readFileSync(join(sibling as string, relativePath), "utf8");
    expect(there).toBe(here);
  });
});
