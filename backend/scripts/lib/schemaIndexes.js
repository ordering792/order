// DB အသစ်မှာ collection က သက်သက်မဖွင့်ရသေးရင် Model.collection.indexes() က
// "ns does not exist" (code 26) နဲ့ throw လုပ်တယ် — legacy index မရှိသေးတာကို
// အများကြီး မှားအောင် မလုပ်ဘဲ [] လို့ သဘောထားမယ်။
async function currentIndexes(Model) {
  try {
    return await Model.collection.indexes();
  } catch (err) {
    if (err?.code === 26 || err?.code === 27 || err?.codeName === "NamespaceNotFound") {
      return [];
    }
    throw err;
  }
}

module.exports = { currentIndexes };
