const Transaction = require("../models/Transaction");
const { toCents, fromCents, decimal } = require("../utils/money");
const { httpError } = require("../utils/httpError");

// Lucky order deposit ကို accepted deposit transaction အများစုပေါင်းနဲ့
// ဖည့်တယ် — 250 လိုချင်တဲ့ order အတွက် 100 + 150 ခွဲသွင်းလို့ ရအောင်။
// tx တစ်ခုချင်းစီရဲ့ appliedAmount က ဘယ်လောက်သုံးပြီးပြီဆိုတာ သိမ်းတယ်၊
// amount − appliedAmount က ဒီ order အတွက် ကျန်တဲ့ငွေ။
const MAX_CLAIM_CANDIDATES = 100;

// Lucky order တစ်ခုက သူပေါ်ပြီးမှ တင်တဲ့ deposit တွေကိုပဲ ခံတယ် (fence =
// task.assignedAt)။ assignedAt မပါရင် legacy assigned task ဖြစ်လို့ fence
// မထားဘူး။
const EPOCH = new Date(0);

function appliedCents(tx) {
  return tx.appliedAmount ? toCents(tx.appliedAmount.toString()) : 0n;
}

function remainingCents(tx) {
  return toCents(tx.amount.toString()) - appliedCents(tx);
}

// $expr က field နှစ်ခုယှဉ်လို့ ရတာ — appliedAmount မပါတဲ့ tx ကို BSON
// ordering အရ number အောက်မှာထားလို့ claimable အဖြစ် ပေါ်တယ်။
function claimableFilter(userId, notBefore) {
  return {
    userId,
    type: "deposit",
    status: "accepted",
    createdAt: { $gte: notBefore ?? EPOCH },
    $expr: { $lt: ["$appliedAmount", "$amount"] },
  };
}

function findClaimable({ userId, notBefore, session }) {
  const query = Transaction.find(claimableFilter(userId, notBefore))
    .sort({ createdAt: 1, _id: 1 })
    .limit(MAX_CLAIM_CANDIDATES)
    .lean();

  return session ? query.session(session) : query;
}

// Match preflight အတွက် — required ကိုကျော်တာနဲ့ ရပ်တယ် (အများကြီး ဖတ်စရာ
// မလိုအောင်)။
async function availableDepositCents({
  userId,
  targetCents,
  notBefore,
  session,
}) {
  const transactions = await findClaimable({ userId, notBefore, session });

  let total = 0n;

  for (const tx of transactions) {
    total += remainingCents(tx);
    if (targetCents !== undefined && total >= targetCents) return total;
  }

  return total;
}

// Oldest-first စုတယ်။ Caller ရဲ့ transaction အတွင်းမှာ run ဖြစ်တဲ့အတွက်
// လိုအပ်ရင် throw လုပ်တာက partial claim တွေကိုပါ rollback ဖြစ်စေတယ်။
async function claimLuckyDeposit({
  userId,
  taskId,
  requiredCents,
  notBefore,
  session,
}) {
  const transactions = await findClaimable({ userId, notBefore, session });

  let needed = requiredCents;
  const claimed = [];

  for (const tx of transactions) {
    if (needed <= 0n) break;

    const available = remainingCents(tx);
    if (available <= 0n) continue;

    const take = available < needed ? available : needed;
    const applied = appliedCents(tx);

    // compare-and-swap: ဖတ်တဲ့ချိန်က appliedAmount နဲ့ write ချိန် တူရမယ်။
    // မတူရင် တစ်ပြိုင်နက် claim ယှဉ်နေတဲ့ signal — ငွေ နှစ်ဆထွက်သွားအောင်
    // မလုပ်ဘူး။
    const updated = await Transaction.findOneAndUpdate(
      {
        _id: tx._id,
        userId,
        type: "deposit",
        status: "accepted",
        appliedAmount: decimal(applied),
      },
      {
        $set: {
          appliedAmount: decimal(applied + take),
          allocation: { taskId, allocatedAt: new Date() },
        },
      },
      { session, returnDocument: "after" },
    );

    if (!updated) {
      throw httpError(409, "Deposit changed while being claimed, please retry");
    }

    claimed.push(updated);
    needed -= take;
  }

  if (needed > 0n) {
    throw httpError(
      400,
      `Accepted deposits are short by ${fromCents(needed)} for this lucky order`,
    );
  }

  return { claimed, appliedCents: requiredCents };
}

module.exports = {
  appliedCents,
  remainingCents,
  availableDepositCents,
  claimLuckyDeposit,
};
