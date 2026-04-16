import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, TrendingUp, ShieldCheck, CheckCircle, Loader2 } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { Button, Card } from '../components/UI';
import { investInVault, checkUSDTBalance, mintMockUSDT } from '../blockchain/ethereum';

export const Marketplace: React.FC = () => {
  const { vaults, isSyncing, walletAddress } = useWorkflow();
  const [investingId, setInvestingId] = useState<string | null>(null);
  const [investStatus, setInvestStatus] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [investAmount, setInvestAmount] = useState('1.0');
  const [usdtBalance, setUsdtBalance] = useState<string>('0.0');
  const [isMinting, setIsMinting] = useState(false);

  const refreshBalance = () => {
    if (walletAddress) {
      checkUSDTBalance(walletAddress).then(setUsdtBalance);
    }
  };

  useEffect(() => {
    refreshBalance();
  }, [walletAddress, isSyncing]);

  const handleInvest = async (id: string, vaultAddress?: string) => {
    if (!vaultAddress) {
      alert("Vault address not found. This asset hasn't been listed correctly.");
      return;
    }
    if (!walletAddress) {
      alert("Please connect your wallet to start the investment flow.");
      return;
    }
    setInvestingId(id);
    try {
      await investInVault(vaultAddress, investAmount, walletAddress, (status) => {
        setInvestStatus(status);
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert("Investment Failed: " + (err.message || "Blockchain error"));
    } finally {
      setInvestingId(null);
      setInvestStatus('');
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">Nexus Marketplace</h1>
          <p className="text-slate-500">Access high-yield, institutional-grade RWAs on Sepolia.</p>
          <div className="flex gap-4 mt-2">
            <a 
              href="https://sepolia-faucet.pk910.de/" target="_blank" rel="noreferrer"
              className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 underline tracking-widest"
            >
              Get Sepolia ETH
            </a>
            <span className="text-slate-300">|</span>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              My USDT: <span className="text-indigo-600">{parseFloat(usdtBalance).toFixed(2)}</span>
            </span>
            <span className="text-slate-300">|</span>
            <button 
              onClick={async () => {
                if (!walletAddress) return;
                setIsMinting(true);
                try {
                  await mintMockUSDT(walletAddress);
                  refreshBalance();
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsMinting(false);
                }
              }}
              disabled={isMinting}
              className="text-[10px] font-black uppercase text-pink-500 hover:text-pink-600 underline tracking-widest disabled:opacity-50"
            >
              {isMinting ? "Claiming..." : "Claim 1,000 Free USDT"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
           <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold ring-1 ring-indigo-200">
              <ShieldCheck size={14} /> Institution Verified
           </div>
           
           <div className="flex items-center gap-2 px-4 py-2 text-slate-400 border-x border-slate-100">
              <Search size={18} />
              <input type="text" placeholder="Search markets..." className="bg-transparent border-none outline-none text-sm font-medium" />
           </div>

           {isSyncing && (
             <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-indigo-600 rounded-xl text-[10px] font-bold animate-pulse">
                <Loader2 size={12} className="animate-spin" /> Syncing...
             </div>
           )}
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
        {vaults.length === 0 ? (
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
          vaults.map((vault) => (
            <motion.div 
              key={vault.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden border-none shadow-2xl shadow-slate-200 hover:shadow-indigo-200/50 transition-all duration-500 group flex flex-col h-full">
                <div className="h-64 overflow-hidden relative">
                  <img src={vault.image} alt={vault.name} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                     <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1 underline underline-offset-4 decoration-2">{vault.symbol} Share</div>
                     <h3 className="text-2xl font-bold text-white tracking-tight">{vault.name}</h3>
                  </div>
                  <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-xl border border-white/30 rounded-full text-[10px] font-bold text-white">
                      <TrendingUp size={12} /> Live NAV: {vault.nav}
                  </div>
                </div>
                
                <div className="p-8 flex flex-col flex-1">
                  <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                      <div className="text-[10px] uppercase font-extrabold text-slate-400 mb-1 tracking-wider">Total Shares</div>
                      <div className="text-sm font-bold text-slate-700">{parseFloat(vault.supply).toLocaleString()} {vault.symbol}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-extrabold text-slate-400 mb-1 tracking-wider">My Ownership</div>
                      <div className="text-sm font-extrabold text-indigo-600">{parseFloat(vault.myShares || '0').toLocaleString()} {vault.symbol}</div>
                    </div>
                  </div>

                  <div className="bg-indigo-50/50 p-6 rounded-[1.5rem] mb-8 border border-indigo-100/50">
                    <div className="text-[10px] uppercase font-black text-indigo-400 mb-2 tracking-widest text-center italic">Institutional Position Value</div>
                    <div className="text-3xl font-black text-slate-900 text-center tracking-tighter">
                       ${parseFloat(vault.openPosition || '0').toLocaleString()}
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
                       <span className="px-4 py-2 text-xs font-bold text-slate-400 underline underline-offset-4 decoration-2 decoration-indigo-200">fUSDT</span>
                    </div>

                    <Button 
                      onClick={() => handleInvest(vault.id, vault.vaultAddress)} 
                      className="w-full h-14 font-black flex flex-col items-center justify-center gap-1 text-lg shadow-xl shadow-indigo-100 hover:shadow-2xl hover:scale-[1.02] transition-all"
                      disabled={investingId === vault.id}
                    >
                      {investingId === vault.id ? (
                        <>
                          <div className="flex items-center gap-2">
                             <Loader2 className="animate-spin" size={20} /> Settling...
                          </div>
                          <div className="text-[8px] uppercase tracking-widest opacity-70 font-black">{investStatus}</div>
                        </>
                      ) : (
                        <><ShieldCheck size={20} /> Invest Now</>
                      )}
                    </Button>
                    
                    <div className="text-center pt-2">
                       <a 
                         href={`https://sepolia.etherscan.io/address/${vault.vaultAddress}`}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="text-[9px] font-black text-slate-400 hover:text-indigo-600 transition-colors inline-flex items-center gap-2 group uppercase tracking-[0.2em]"
                       >
                          <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" /> 
                          Vault Smart Contract Explorer
                       </a>
                    </div>
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
