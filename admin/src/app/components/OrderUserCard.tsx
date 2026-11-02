"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ApiBoardRow, ApiPlan } from "@/lib/api";
import { money } from "@/lib/money";
import { useT } from "@/lib/i18n";

export interface LuckyTagInput {
  orderNumber: string;
  requiredDeposit: string;
  luckyCommission: string;
}

const EMPTY_TAG: LuckyTagInput = {
  orderNumber: "",
  requiredDeposit: "0.00",
  luckyCommission: "0.00",
};

// Caption row နဲ့ input rows တွေ တစ်ဆင့်တည်း တန်းစီအောင် column grid ကို
// နှစ်နေရာမှာ share လုပ်တယ် (delete ခလုတ် vs add ခလုတ် အကျယ်မတူဘူး)။
const TAG_GRID =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_26px] gap-1.5";
const ADD_GRID =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5";
const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[#ff6600]";
const CAPTION =
  "text-[10px] font-semibold uppercase tracking-wide text-slate-500";

interface OrderUserCardProps {
  row: ApiBoardRow;
  busy: boolean;
  onCreate: (userId: string, totalOrders: number) => void;
  onUpdateDraft: (
    plan: ApiPlan,
    totalOrders: number,
    tags: LuckyTagInput[],
  ) => void;
  onAddLucky: (plan: ApiPlan, tag: LuckyTagInput) => Promise<boolean>;
  onGenerate: (plan: ApiPlan) => void;
  onDelete: (plan: ApiPlan) => void;
  onOpenTasks: (row: ApiBoardRow) => void;
}

function Metric({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex h-full min-w-0 flex-col justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 ${className}`}
    >
      <p className={CAPTION}>{label}</p>
      <div className="text-sm font-bold text-slate-800">{children}</div>
    </div>
  );
}

// Lucky tag တွေမှာ product selection မပါဘူး — deposit/commission ပဲ ထည့်ပြီး
// product ကို backend က price band ထဲကနေ အလိုအလျောက် ရွေးတယ်။
function tagsFromPlan(plan?: ApiPlan | null): LuckyTagInput[] {
  return (plan?.luckyPositions ?? []).map((position) => ({
    orderNumber: String(position.orderNumber),
    requiredDeposit: money(position.requiredDeposit),
    luckyCommission: money(position.luckyCommission),
  }));
}

export default function OrderUserCard({
  row,
  busy,
  onCreate,
  onUpdateDraft,
  onAddLucky,
  onGenerate,
  onDelete,
  onOpenTasks,
}: OrderUserCardProps) {
  const t = useT();
  const { user, plan } = row;
  const isDraft = plan?.status === "draft";
  const isGenerated = plan?.status === "generated";

  const [count, setCount] = useState(String(plan?.totalOrders ?? ""));
  const [tags, setTags] = useState<LuckyTagInput[]>(tagsFromPlan(plan));
  const [newTag, setNewTag] = useState<LuckyTagInput>(EMPTY_TAG);

  // Input တွေက server data ကနေ mount အတိုင်းပဲ seed ဖြစ်တယ် — parent က
  // plan._id + totalOrders ပါတဲ့ key နဲ့ card ကို remount လုပ်တဲ့အတွက်
  // data က ဘယ်တော့မှ stale မဖြစ်ဘူး။

  const totalOrders = plan?.totalOrders ?? Number(count);
  const completed = plan?.completedCount ?? 0;
  const remaining = Math.max(0, totalOrders - completed);
  const percent =
    totalOrders > 0 ? Math.min(100, Math.round((completed / totalOrders) * 100)) : 0;
  const countValid = Number(count) >= 1 && Number(count) <= 500;
  const luckyCount = plan?.luckyPositions?.length ?? tags.length;

  // Functional updates: မြန်မြန်နှိပ်ရင် (double-click) တစ်ချီတည်းက
  // tags ကို အစားမသွားစေချင်လို့။
  const patchTag = (index: number, patch: Partial<LuckyTagInput>) =>
    setTags((prev) => prev.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)));

  return (
    <article
      data-testid="order-card"
      className="@container rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold uppercase text-orange-600">
            {user.name.trim().charAt(0) || "—"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">
              {user.phone} · {t("admin.plans.uid")} {user.invitationCode}
            </p>
          </div>
        </div>

        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
            !plan
              ? "bg-slate-100 text-slate-500"
              : isGenerated
                ? "bg-orange-50 text-orange-600"
                : "bg-amber-50 text-amber-600"
          }`}
        >
          {!plan
            ? t("admin.plans.noPlan")
            : isGenerated
              ? t("admin.stats.generated")
              : t("admin.status.draft")}
        </span>

        {plan && (
          <div className="flex items-center gap-1.5">
            {isDraft && (
              <button
                data-testid="card-generate"
                onClick={() => onGenerate(plan)}
                disabled={busy}
                className="rounded-lg bg-[#ff6600] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {t("admin.action.generate")}
              </button>
            )}
            {isGenerated && (
              <button
                data-testid="card-tasks"
                onClick={() => onOpenTasks(row)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                {t("admin.plans.tasks")}
              </button>
            )}
            {isDraft && (
              <button
                onClick={() => onDelete(plan)}
                disabled={busy}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-50"
              >
                {t("admin.delete")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-2">
            <Metric className="col-span-3" label={t("admin.plans.orderCount")}>
              {isGenerated ? (
                <input
                  data-testid="card-order-count-locked"
                  type="number"
                  value={plan?.totalOrders ?? 0}
                  disabled
                  title={t("admin.plans.countLocked")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    data-testid="card-order-count"
                    type="number"
                    min={1}
                    max={500}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className={`${FIELD} font-semibold`}
                  />
                  <button
                    data-testid="card-save"
                    onClick={() => {
                      const orders = Number(count);

                      if (plan) {
                        onUpdateDraft(plan, orders, tags);
                        return;
                      }

                      onCreate(user._id, orders);
                    }}
                    disabled={busy || !countValid}
                    className="shrink-0 rounded-lg bg-[#ff6600] px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    {t("admin.save")}
                  </button>
                </div>
              )}
            </Metric>

            <Metric label={t("admin.stats.completed")}>
              <span className="text-emerald-600">{completed}</span>
            </Metric>

            <Metric label={t("admin.plans.remaining")}>
              <span className={remaining > 0 ? "text-amber-600" : "text-slate-400"}>
                {plan ? remaining : 0}
              </span>
            </Metric>

            <Metric label={t("admin.field.balance")}>
              <span className="text-emerald-600">${money(user.balance)}</span>
            </Metric>
          </div>

          {plan && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {isGenerated && remaining > 0 && (
                <p className="shrink-0 text-[11px] text-slate-400">
                  {t("admin.plans.roundOpen", { count: remaining })}
                </p>
              )}
            </div>
          )}

          {!plan && (
            <p className="mt-2 text-[11px] text-slate-400">
              {t("admin.plans.orderCountHint")}
            </p>
          )}
        </div>

        <section className="min-w-0 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 px-2.5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p className="text-[11px] font-bold text-slate-700">
              {t("admin.lucky.title")}
            </p>
            <span className="text-[11px] font-semibold text-amber-700">
              {t("admin.plans.tagCount", { count: luckyCount })}
            </span>
          </div>

          {luckyCount === 0 && (
            <p className="mt-1 text-[11px] text-slate-400">{t("admin.lucky.none")}</p>
          )}

          {isDraft && (
            <div className={TAG_GRID + " mt-2"}>
              <p className={CAPTION}>{t("admin.lucky.orderNumber")}</p>
              <p className={CAPTION}>{t("admin.lucky.requiredDeposit")}</p>
              <p className={CAPTION}>{t("admin.lucky.commission")}</p>
              <span />
            </div>
          )}

          {isDraft && (
            <div className="mt-1.5 space-y-1.5">
              {tags.map((tag, index) => (
                <div data-testid="card-lucky-row" key={index} className={TAG_GRID}>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={tag.orderNumber}
                    aria-label={t("admin.lucky.orderNumber")}
                    onChange={(e) => patchTag(index, { orderNumber: e.target.value })}
                    className={FIELD}
                  />
                  <input
                    value={tag.requiredDeposit}
                    aria-label={t("admin.lucky.requiredDeposit")}
                    inputMode="decimal"
                    onChange={(e) => patchTag(index, { requiredDeposit: e.target.value })}
                    className={FIELD}
                  />
                  <input
                    value={tag.luckyCommission}
                    aria-label={t("admin.lucky.commission")}
                    inputMode="decimal"
                    onChange={(e) => patchTag(index, { luckyCommission: e.target.value })}
                    className={FIELD}
                  />
                  <button
                    onClick={() => setTags((prev) => prev.filter((_, i) => i !== index))}
                    title={t("admin.lucky.remove")}
                    aria-label={t("admin.lucky.remove")}
                    className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 transition hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <button
                onClick={() => setTags((prev) => [...prev, { ...EMPTY_TAG }])}
                className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-50"
              >
                <Plus size={12} />
                {t("admin.lucky.add")}
              </button>
            </div>
          )}

          {isGenerated && (
            <div className="mt-2">
              <div className={ADD_GRID}>
                <p className={CAPTION}>{t("admin.lucky.orderNumber")}</p>
                <p className={CAPTION}>{t("admin.lucky.requiredDeposit")}</p>
                <p className={CAPTION}>{t("admin.lucky.commission")}</p>
                <span />
              </div>

              {(plan?.luckyPositions ?? []).map((position) => (
                <div key={position.orderNumber} className={ADD_GRID + " mt-1"}>
                  <p className="text-xs font-semibold text-slate-700">
                    #{position.orderNumber}
                  </p>
                  <p className="text-xs text-slate-600">${money(position.requiredDeposit)}</p>
                  <p className="text-xs text-slate-600">
                    +${money(position.luckyCommission)}
                  </p>
                  <span />
                </div>
              ))}

              <p className="mt-2 text-[11px] text-slate-400">
                {t("admin.plans.luckyOpenOnly")}
              </p>
              <div className={ADD_GRID + " mt-1"}>
                <input
                  data-testid="new-lucky-number"
                  type="number"
                  min={1}
                  max={plan?.totalOrders ?? 500}
                  value={newTag.orderNumber}
                  aria-label={t("admin.lucky.orderNumber")}
                  onChange={(e) => setNewTag({ ...newTag, orderNumber: e.target.value })}
                  className={FIELD}
                />
                <input
                  value={newTag.requiredDeposit}
                  aria-label={t("admin.lucky.requiredDeposit")}
                  inputMode="decimal"
                  onChange={(e) => setNewTag({ ...newTag, requiredDeposit: e.target.value })}
                  className={FIELD}
                />
                <input
                  value={newTag.luckyCommission}
                  aria-label={t("admin.lucky.commission")}
                  inputMode="decimal"
                  onChange={(e) => setNewTag({ ...newTag, luckyCommission: e.target.value })}
                  className={FIELD}
                />
                <button
                  data-testid="card-add-lucky"
                  onClick={async () => {
                    if (!plan) return;
                    // Add လုပ်အောင်သွားရင် ပုံစံကို ရှင်းတယ် — failure မှာ
                    // admin ရဲ့ တန်ဖိုးတွေ ထားတယ် (ပြင်ပြီး ပြန်နှိပ်လို့ရအောင်)။
                    if (await onAddLucky(plan, newTag)) setNewTag(EMPTY_TAG);
                  }}
                  disabled={busy || newTag.orderNumber === ""}
                  className="flex items-center gap-1 rounded-lg bg-[#ff6600] px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
                >
                  <Plus size={12} />
                  {t("admin.lucky.add")}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
