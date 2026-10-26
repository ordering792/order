// MongoDB unique index ကျန်လို့ ဖြစ်တဲ့ duplicate key error ကို မှန်မှန် စမ်းစစ်ဖို့။
// insertMany က MongoBulkWriteError ပြန်ပေးတာမို့ code နဲ့ပဲ မတိုင်းလို့ message ကိုလည်း စစ်မယ်။
function isDuplicateKeyError(err) {
  if (!err) return false;
  if (err.code === 11000) return true;

  if (
    Array.isArray(err.writeErrors) &&
    err.writeErrors.some((writeError) => writeError?.code === 11000)
  ) {
    return true;
  }

  return typeof err.message === "string" && err.message.includes("E11000");
}

module.exports = { isDuplicateKeyError };
