// src/app/deposit/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Headphones, Calendar, Copy, Camera, Check,
  CheckCircle
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import RequireAuth from "../components/RequireAuth";

export default function DepositPage() {
  const { user } = useAuth();
  const t = useT();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState<string>("1000");
  const [displayAmount, setDisplayAmount] = useState("$1,000.00");
  const [cryptoAddress, setCryptoAddress] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [payTo, setPayTo] = useState<string | null>(null);
  const [addressSource, setAddressSource] = useState<"owner" | "admin" | null>(null);
  const [orderId, setOrderId] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.depositInfo()
      .then((res) => {
        setCryptoAddress(res.cryptoAddress);
        setQrUrl(res.qrUrl);
        setPayTo(res.payTo);
        setAddressSource(res.source);
      })
      .catch(() => {
        setCryptoAddress(null);
        setQrUrl(null);
        setPayTo(null);
        setAddressSource(null);
      });
  }, [user]);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2500);
  };

  const handleAmountSelect = (val: number) => {
    setAmount(val.toString());
    updateDisplay(val);
  };

  const updateDisplay = (val: string | number) => {
    const num = Number(val);
    if (val && !isNaN(num) && num > 0) {
      setDisplayAmount("$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
      setDisplayAmount("$0.00");
    }
  };

  const generateOrderId = () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const rand = Math.floor(100000 + Math.random() * 900000);
    return "EP" + mm + dd + rand;
  };

  const handleProceedToStep2 = () => {
    if (!amount || Number(amount) <= 0) {
      showToast(t("deposit.invalidAmount"));
      return;
    }
    if (!cryptoAddress) {
      showToast(t("deposit.noAddress"));
      return;
    }
    const newOrderId = generateOrderId();
    setOrderId(newOrderId);
    setStep(2);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t("deposit.copied"));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setProofImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitDeposit = async () => {
    if (!proofImage) {
      showToast(t("deposit.needProof"));
      return;
    }
    setIsSubmitting(true);
    try {
      await api.createTransaction({
        type: "deposit",
        amount: Number(amount).toFixed(2),
        proofScreenshot: proofImage,
      });
      setStep(3);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("deposit.submitFailed");
      showToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RequireAuth>
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-gray-50 shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className={`fixed top-5 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-xs px-5 py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 z-50 transition-all duration-300 ${toast.show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <CheckCircle className="text-emerald-400" size={18} />
          <span>{toast.message}</span>
        </div>

        <div className="w-full bg-[#ff6600] text-white px-4 py-3.5 flex justify-between items-center shadow-sm z-30 shrink-0">
          <Link href="/" className="text-white flex items-center">
            <ChevronLeft size={28} />
          </Link>
          <span className="font-bold text-base tracking-wider">{t("deposit.title")}</span>
          <Link href="/support" className="text-white flex items-center">
            <Headphones size={22} />
          </Link>
        </div>

        {step === 1 && (
          <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 bg-white">

            <div className="bg-gradient-to-r from-[#ff782d] to-[#ff5100] rounded-2xl p-4 text-white shadow-md relative overflow-hidden flex justify-between items-center">
              <div className="space-y-1 z-10">
                <span className="text-xs text-orange-100 font-medium">{t("deposit.specifyAmount")}</span>
                <div className="text-3xl font-black tracking-tight">{displayAmount}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {[1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000].map((val) => (
                <button
                  key={val}
                  onClick={() => handleAmountSelect(val)}
                  className={`border py-2.5 rounded-xl text-xs font-bold transition ${
                    amount === val.toString()
                    ? "border-[#ff6600] text-[#ff6600] bg-orange-50"
                    : "border-gray-200 text-gray-700 bg-gray-50/50 hover:border-[#ff6600] hover:text-[#ff6600]"
                  }`}
                >
                  ${val.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="flex items-center border-b border-gray-200 py-2.5 px-1 focus-within:border-[#ff6600]">
              <Calendar className="text-[#ff6600] mr-3" size={22} />
              <input
                type="number"
                placeholder={t("deposit.manualPlaceholder")}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  updateDisplay(e.target.value);
                }}
                className="w-full bg-transparent outline-none text-gray-700 placeholder-gray-400 text-sm font-medium"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-4 bg-[#ff6600] rounded-full"></div>
                <h3 className="font-bold text-gray-800 text-sm">{t("deposit.paymentMethod")}</h3>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-orange-50/60 border-orange-200 border rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold text-base shadow-sm">
                    $
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">USDT ($)</span>
                    <span className="text-[10px] text-gray-400 block">TRC20</span>
                  </div>
                </div>
                <div className="w-5 h-5 rounded-full bg-[#ff6600] text-white flex items-center justify-center text-xs">
                  <Check size={12} strokeWidth={3} />
                </div>
              </div>
            </div>

            <div className="pt-4 pb-6">
              <button
                onClick={handleProceedToStep2}
                className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-full font-bold shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98]"
              >
                {t("deposit.title")}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 bg-gray-50">

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">{t("deposit.orderId")}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-gray-800">{orderId}</span>
                  <button onClick={() => handleCopy(orderId)} className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded font-bold hover:bg-orange-100 transition flex items-center gap-1">
                    <Copy size={12} /> {t("deposit.copy")}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-gray-100 pt-2">
                <span className="text-gray-400">{t("deposit.amount")}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-black text-rose-500 text-sm">{displayAmount}</span>
                  <button onClick={() => handleCopy(displayAmount)} className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded font-bold hover:bg-orange-100 transition flex items-center gap-1">
                    <Copy size={12} /> {t("deposit.copy")}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col items-center space-y-4 text-center">
              <div className="flex items-center justify-between w-full border-b pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold text-sm">
                    $
                  </div>
                  <span className="font-bold text-gray-800 text-sm">USDT</span>
                </div>
                <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-2.5 py-1 rounded border">TRC20</span>
              </div>

              <div className="w-48 h-48 bg-gray-100 rounded-xl p-2 border border-gray-200 flex items-center justify-center">
                {cryptoAddress ? (
                  <img
                    src={qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${cryptoAddress}`}
                    alt="QR Code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400 text-center px-2">{t("deposit.noAddressConfigured")}</span>
                )}
              </div>
              <span className="text-[11px] text-gray-400">{t("deposit.qrCode")}</span>

              {cryptoAddress && (
                <div className="w-full text-center">
                  <p className="text-[10px] text-gray-400">
                    {t("deposit.payTo")}:{" "}
                    <span className="font-semibold text-gray-600">
                      {payTo || t("deposit.platformWallet")}
                    </span>
                    {addressSource === "admin" && (
                      <span className="ml-1 text-[9px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
                        {t("deposit.platformWallet")}
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="w-full bg-orange-50/60 border border-orange-100 rounded-xl p-3 flex items-center justify-between text-left">
                <div className="overflow-hidden pr-2">
                  <span className="text-[10px] text-gray-400 block">{t("deposit.walletAddress")}</span>
                  <span className="text-xs font-bold text-[#ff6600] truncate block">{cryptoAddress || t("deposit.loading")}</span>
                </div>
                <button onClick={() => cryptoAddress && handleCopy(cryptoAddress)} className="text-orange-600 bg-orange-100/80 px-2.5 py-1 rounded text-xs font-bold shrink-0 hover:bg-orange-200 transition">
                  {t("deposit.copy")}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-4 bg-[#ff6600] rounded-full"></div>
                <h3 className="font-bold text-gray-800 text-xs">{t("deposit.uploadScreenshot")}</h3>
              </div>
              <p className="text-[10px] text-gray-400">{t("deposit.uploadHint")}</p>

              <label
                htmlFor="proofFile"
                className={`w-24 h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#ff6600] transition relative overflow-hidden group ${proofImage ? 'bg-cover bg-center' : ''}`}
                style={proofImage ? { backgroundImage: `url(${proofImage})` } : {}}
              >
                {!proofImage && (
                  <>
                    <Camera className="text-gray-400 group-hover:text-[#ff6600]" size={24} />
                    <span className="text-[10px] text-gray-400 mt-1">{t("deposit.uploadProof")}</span>
                  </>
                )}
                <input
                  type="file"
                  id="proofFile"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            </div>

            <div className="pt-2 pb-6 flex space-x-2">
              <button onClick={() => setStep(1)} className="w-1/3 bg-gray-100 text-gray-600 py-3.5 rounded-full font-bold text-xs hover:bg-gray-200 transition">
                {t("deposit.back")}
              </button>
              <button
                onClick={handleSubmitDeposit}
                disabled={isSubmitting}
                className="w-2/3 bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-full font-bold text-xs shadow-lg shadow-orange-500/30 hover:opacity-95 transition disabled:opacity-70"
              >
                {isSubmitting ? t("deposit.submitting") : t("deposit.confirmSubmit")}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-6 flex flex-col items-center justify-center space-y-5 bg-white text-center">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl shadow-sm">
              <Check size={40} />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-800">{t("deposit.submittedTitle")}</h2>
              <p className="text-xs text-gray-500 max-w-[280px]">{t("deposit.submittedBody")}</p>
            </div>

            <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-gray-400">{t("deposit.orderIdLabel")}</span>
                <span className="font-bold text-gray-800">{orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t("deposit.amountLabel")}</span>
                <span className="font-bold text-emerald-600">{displayAmount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t("deposit.statusLabel")}</span>
                <span className="font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded">{t("deposit.pending")}</span>
              </div>
            </div>

            <div className="w-full space-y-2.5 pt-2">
              <Link href="/deposit/history" className="w-full block bg-orange-50 text-[#ff6600] border border-orange-200 py-3 rounded-full font-bold text-xs hover:bg-orange-100 transition">
                {t("deposit.viewHistory")}
              </Link>
              <Link href="/" className="w-full block bg-gray-900 text-white py-3 rounded-full font-bold text-xs hover:opacity-90 transition">
                {t("deposit.backHome")}
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
    </RequireAuth>
  );
}
