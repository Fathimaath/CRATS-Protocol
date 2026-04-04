import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, TrendingUp, ShieldCheck, CheckCircle, Loader2 } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { Button, Card } from '../components/UI';
import { investInVault } from '../blockchain/ethereum';

export const Marketplace: React.FC = () => {
  const { assets } = useWorkflow();
  const [investingId, setInvestingId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [investAmount, setInvestAmount] = useState('1.0');

  const handleInvest = async (id: string, vaultAddress?: string) => {
    if (!vaultAddress) {
      alert("Vault address not found. This asset hasn't been listed correctly.");
      return;
    }
    setInvestingId(id);
    try {
      await investInVault(vaultAddress, investAmount);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert("Investment Failed: " + (err.message || "Blockchain error"));
    } finally {
      setInvestingId(null);
    }
  };

  const listedAssets = assets.filter(a => a.isListed);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">Nexus Marketplace</h1>
          <p className="text-slate-500">Access high-yield, institutional-grade RWAs on Sepolia.</p>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
           <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold ring-1 ring-indigo-200">
              <ShieldCheck size={14} /> Institution Verified
           </div>
           <div className="flex items-center gap-2 px-4 py-2 text-slate-400">
              <Search size={18} />
              <input type="text" placeholder="Search markets..." className="bg-transparent border-none outline-none text-sm font-medium" />
           </div>
        </div>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-emerald-500 text-white rounded-2xl flex items-center justify-center gap-3 font-bold shadow-xl shadow-emerald-200"
          >
            <CheckCircle size={20} /> Investment Successful! Shares minted to your wallet.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {listedAssets.length === 0 ? (
          <div className="col-span-full py-32 flex flex-col items-center justify-center bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
             <div className="p-6 bg-white rounded-3xl shadow-xl shadow-indigo-50 mb-6">
                <TrendingUp size={48} className="text-slate-300" />
             </div>
             <p className="text-slate-500 font-bold text-lg">Market is Syncing...</p>
             <p className="text-slate-400 text-sm mt-1 max-w-sm text-center">
                New institutional vaults appear here once listed by Issuers through the Tokenization Studio.
             </p>
          </div>
        ) : (
          listedAssets.map((asset) => (
            <motion.div 
              key={asset.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden border-none shadow-2xl shadow-slate-200 hover:shadow-indigo-200/50 transition-all duration-500 group flex flex-col h-full">
                <div className="h-64 overflow-hidden relative">
                  <img src={asset.image} alt={asset.name} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                     <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1 underline underline-offset-4 decoration-2">Vault Registered</div>
                     <h3 className="text-2xl font-bold text-white tracking-tight">{asset.name}</h3>
                  </div>
                  <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-xl border border-white/30 rounded-full text-[10px] font-bold text-white">
                      <TrendingUp size={12} /> Live Yield: 7.2%
                  </div>
                </div>
                
                <div className="p-8 flex flex-col flex-1">
                  <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                      <div className="text-[10px] uppercase font-extrabold text-slate-400 mb-1 tracking-wider">Asset Class</div>
                      <div className="text-sm font-bold text-slate-700">{asset.category}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-extrabold text-slate-400 mb-1 tracking-wider">TVL</div>
                      <div className="text-sm font-bold text-indigo-600">$45,200,000</div>
                    </div>
                  </div>

                  <div className="mt-auto space-y-4">
                    <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                       <input 
                         type="number" 
                         value={investAmount}
                         onChange={e => setInvestAmount(e.target.value)}
                         className="bg-transparent border-none outline-none flex-1 px-4 text-sm font-bold text-slate-700" 
                         placeholder="Amount..." 
                        />
                       <span className="px-4 py-2 text-xs font-bold text-slate-400">USDC</span>
                    </div>

                    <Button 
                      onClick={() => handleInvest(asset.id, asset.vaultAddress)} 
                      className="w-full h-14 font-black flex items-center justify-center gap-2 text-lg shadow-xl shadow-indigo-100"
                      disabled={investingId === asset.id}
                    >
                      {investingId === asset.id ? (
                        <><Loader2 className="animate-spin" size={20} /> Investing...</>
                      ) : (
                        <><ShieldCheck size={20} /> Open Position</>
                      )}
                    </Button>
                    
                    {asset.vaultAddress && (
                      <div className="text-center">
                         <a 
                           href={`https://sepolia.etherscan.io/address/${asset.vaultAddress}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="text-[10px] font-bold text-slate-400 hover:text-indigo-500 transition-colors inline-flex items-center gap-1"
                         >
                            Primary Vault Contract <ChevronRight size={10} />
                         </a>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
