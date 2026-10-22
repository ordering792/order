"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ChevronLeft, Plus, Diamond, Search, X, Trophy, Zap, 
  AlertCircle, Star, Home, ClipboardList, Headphones, User 
} from "lucide-react";

const userData = {
  balance: 1451.23,
  totalCommission: 1201.23,
  freezeBalance: 0.00,
  totalOrderNumber: 40,
  vipLevel: "FREE VIP",
  commissionRate: "0.30%",
  completedCount: 40,
  remainingCount: 0,
  undoneCount: 0,
};

const dummyProduct = {
  id: 1,
  orderId: "ORD-2024-001",
  name: "Premium Wireless Noise-Cancelling Headphones",
  description: "Experience crystal-clear sound with our latest active noise cancellation technology. Up to 30 hours of battery life for all-day listening.",
  image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
  price: 50.00,
  profit: 15.00,
  requireDeposit: 0,
  paidDeposit: 0,
};

export default function GrabPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [matchingStatus] = useState("Searching for available products...");
  const [activeProduct, setActiveProduct] = useState<typeof dummyProduct | null>(null);
  const [isLuckyOrder, setIsLuckyOrder] = useState(false);
  
  const startMatching = () => {
    setIsModalOpen(true);
    setIsLoading(true);
    setActiveProduct(null);

    setTimeout(() => {
      setIsLoading(false);
      const isLucky = Math.random() > 0.5;
      setIsLuckyOrder(isLucky);
      setActiveProduct({
        ...dummyProduct,
        requireDeposit: isLucky ? 100.00 : 0,
      });
    }, 1500);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveProduct(null);
  };

  const handleSubmitOrder = () => {
    alert("Order Submitted Successfully! (Simulation)");
    closeModal();
  };

  const isDepositRequired = activeProduct && activeProduct.requireDeposit > 0;

  return (
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-gray-50 shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className="bg-[#ff6600] text-white px-4 py-3.5 flex items-center justify-between shadow-sm z-30 shrink-0">
          <Link href="/" className="text-white flex items-center justify-center">
            <ChevronLeft size={30} />
          </Link>
          <span className="font-bold text-lg tracking-wider">Shop Order</span>
          <div className="w-8"></div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 pb-24">
          
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 flex justify-between items-center relative">
            <div>
              <div className="text-2xl font-black text-[#ff6600] flex items-center">
                <span className="text-base mr-0.5">$</span>
                {userData.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs font-semibold text-gray-400">Balance</span>
            </div>
            <Link href="/deposit" className="w-10 h-10 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center text-white shadow-md hover:scale-105 transition">
              <Plus size={20} className="font-bold" />
            </Link>
          </div>

          <div className="bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white rounded-2xl p-5 shadow-lg relative overflow-hidden space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Diamond size={16} className="text-amber-300" />
              </div>
              <div>
                <h3 className="font-bold text-base tracking-wide">{userData.vipLevel}</h3>
                <p className="text-[11px] text-orange-100 font-medium">
                  Commission Rate: {userData.commissionRate} | {userData.completedCount} Tasks
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 text-center pt-2 border-t border-white/20">
              <div>
                <div className="text-xl font-black">{userData.completedCount}</div>
                <span className="text-[10px] text-orange-100 leading-tight block mt-0.5">Order complete!</span>
              </div>
              <div>
                <div className="text-xl font-black">{userData.remainingCount}</div>
                <span className="text-[10px] text-orange-100 leading-tight block mt-0.5">Remaining</span>
              </div>
              <div>
                <div className="text-xl font-black">{userData.undoneCount}</div>
                <span className="text-[10px] text-orange-100 leading-tight block mt-0.5">Undone</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-base font-black text-gray-800">
                  $ {userData.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs font-semibold text-gray-400">Total Commission</span>
              </div>
              <div>
                <div className="text-base font-black text-gray-800">
                  $ {userData.freezeBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs font-semibold text-gray-400">Freeze Balance</span>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-base font-black text-gray-800">{userData.totalOrderNumber}</div>
                <span className="text-xs font-semibold text-gray-400">Order number</span>
              </div>
              <div>
                <div className="text-base font-black text-gray-800">
                  $ {userData.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-xs font-semibold text-gray-400">My balance</span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button 
              onClick={startMatching}
              className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-4 rounded-full font-bold text-base shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98]"
            >
              Begin Matching
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
            <h4 className="font-bold text-gray-800 text-xs flex items-center">
              <AlertCircle size={14} className="text-[#ff6600] mr-1.5" /> 
              Take a closer look at system rules:
            </h4>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Welcome to our platform! Users can seamlessly grab high-value orders and earn attractive daily commissions based on their respective VIP status levels and account tiers. To ensure smooth operations and uninterrupted daily tasks, please verify that your account balance, transaction limits, and credit ratings consistently meet the minimum platform requirements. Our automated system monitors daily matching accuracy to protect user funds, maximize profits, and prevent fraudulent activities. For any assistance regarding VIP upgrades, withdrawals, or task completion rules, please reach out to our 24/7 customer support team. Trade responsibly and maximize your daily earning potential today!
            </p>
          </div>

        </div>

        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">Home</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-medium mt-1">Orders</span>
          </Link>
          
          <Link href="/grab" className="flex flex-col items-center relative -top-4 group">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center border-4 border-white shadow-md text-white transition transform group-hover:scale-105 active:scale-95 overflow-hidden">
              <img src="/images/11321466.gif" alt="Icon" className="w-full h-full object-contain" />
            </div>
          </Link>

          <Link href="/support" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Headphones size={22} />
            <span className="text-[9px] font-medium mt-1">Support</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <User size={22} />
            <span className="text-[9px] font-medium mt-1">Profile</span>
          </Link>
        </nav>

      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300">
          
          {isLoading && (
            <div className="bg-white w-full max-w-[300px] rounded-3xl p-6 flex flex-col items-center text-center space-y-4 shadow-2xl">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-orange-100 border-t-[#ff6600] animate-spin"></div>
                <Search size={24} className="text-[#ff6600] z-10" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-base">Matching Order...</h3>
                <p className="text-xs text-gray-400 mt-1">{matchingStatus}</p>
              </div>
            </div>
          )}

          {!isLoading && activeProduct && (
            <div className="bg-white w-full max-w-[380px] max-h-[90vh] rounded-3xl p-5 flex flex-col space-y-3 shadow-2xl overflow-y-auto custom-scrollbar">
              
              <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-gray-800 text-sm">Order Detail</h3>
                  {isLuckyOrder && (
                    <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                      <Zap size={10} className="text-amber-200" /> Lucky Order
                    </span>
                  )}
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <div className="flex items-start space-x-3 bg-gray-50/50 p-2.5 rounded-2xl border border-gray-100">
                <div className="w-24 h-24 bg-gray-900 rounded-xl overflow-hidden shadow-sm relative shrink-0 flex items-center justify-center border border-gray-200">
                  <img src={activeProduct.image} alt="Product" className="w-full h-full object-contain" />
                  {isLuckyOrder && (
                    <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-md text-amber-300 px-1.5 py-0.5 rounded text-[8px] font-bold border border-amber-400/30 flex items-center gap-0.5">
                      <Trophy size={8} /> Lucky
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="font-bold text-gray-800 text-xs line-clamp-2 leading-snug">{activeProduct.name}</h4>
                  <p className="text-[10px] text-gray-500 line-clamp-4 leading-relaxed">{activeProduct.description}</p>
                </div>
              </div>

              <div className="bg-orange-50/60 border border-orange-100 p-3 rounded-2xl space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600 border-b border-orange-200/60 pb-1.5 mb-1">
                  <span>Order ID:</span>
                  <span className="font-bold text-orange-600 font-mono">{activeProduct.orderId}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Price:</span>
                  <span className="font-semibold text-gray-800">$ {activeProduct.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Deposit Funds:</span>
                  <span className="font-semibold text-rose-500">$ {activeProduct.requireDeposit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Estimated Profit:</span>
                  <span className="font-bold text-emerald-600">+ $ {activeProduct.profit.toFixed(2)}</span>
                </div>
                <div className="border-t border-orange-200 pt-1.5 flex justify-between font-black text-gray-800 text-sm">
                  <span>Total Amount:</span>
                  <span className="text-rose-500">$ {(activeProduct.price + activeProduct.requireDeposit + activeProduct.profit).toFixed(2)}</span>
                </div>
              </div>

              {isDepositRequired && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-600 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <AlertCircle size={14} />
                    <span>Insufficient Balance!</span>
                  </div>
                  <p className="text-[11px]">
                    Please deposit ${activeProduct.requireDeposit.toFixed(2)} more for this Lucky Order.
                  </p>
                </div>
              )}

              <div className="flex flex-col items-center space-y-1 py-1">
                <span className="text-[11px] font-semibold text-gray-500">Rate this product</span>
                <div className="flex space-x-1 text-amber-400">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={20} fill="currentColor" />
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-500">Feedback / Comments</span>
                <textarea 
                  placeholder="Write your review here..." 
                  rows={2} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs text-gray-700 outline-none focus:border-[#ff6600] resize-none"
                ></textarea>
              </div>

              <div className="flex space-x-2 pt-1">
                <button 
                  onClick={closeModal} 
                  className="w-1/2 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold text-xs hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                {isDepositRequired ? (
                  <Link 
                    href="/deposit" 
                    className="w-1/2 bg-gradient-to-r from-rose-500 to-red-600 text-white py-3 rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition text-center"
                  >
                    Deposit Now
                  </Link>
                ) : (
                  <button 
                    onClick={handleSubmitOrder}
                    className="w-1/2 bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3 rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition"
                  >
                    Submit Order
                  </button>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
  );
}