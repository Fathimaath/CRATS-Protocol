import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Loader2, Info, CheckCircle, User, Globe, Hash, ExternalLink, Activity, Zap } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { Button, Card } from '../components/UI';
import { onboardUser } from '../blockchain/ethereum.ts';
import { IDENTITY_REGISTRY_ADDR, IDENTITY_SBT_ADDR } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';

const COUNTRY_MAP: Record<string, number> = {
  'United Kingdom': 826,
  'United States': 840,
  'Singapore': 702,
  'Germany': 276
};

export const Verification = () => {
  const { verificationStatus, setVerificationStatus, role, walletAddress } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('Ready to Verify');
  const [txHash, setTxHash] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    country: 'United Kingdom',
    idNumber: ''
  });

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      alert("Please connect your Metamask wallet first.");
      return;
    }
    
    setIsProcessing(true);
    setStatus('Minting Identity SBT to your wallet...');
    
    try {
      // Single transaction: Register + Mint SBT directly to user address
      const countryCode = COUNTRY_MAP[formData.country] || 826;
      const roleId = role === 'issuer' ? 4 : 1;

      const hash = await onboardUser(walletAddress, countryCode, roleId); 
      setTxHash(hash);
      
      setStatus('SBT Minted Successfully!');
      setTimeout(() => {
        setVerificationStatus(true);
      }, 1500);
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + (e.message || 'Onboarding failed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const RenderTxLink = ({ hash, label }: { hash?: string | null; label: string }) => {
    if (!hash) return null;
    return (
      <a 
        href={`https://sepolia.etherscan.io/tx/${hash}`} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-3 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100 mt-2"
      >
        <Activity size={14} /> {label}: {hash.slice(0, 10)}... <ExternalLink size={12} />
      </a>
    );
  };

  if (verificationStatus) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-10 text-center"
      >
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-emerald-100 logo-glow">
          <CheckCircle size={48} />
        </div>
        <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter">Onboarding Complete</h2>
        <p className="text-slate-500 mb-8 max-w-md text-lg leading-relaxed">
          Your Identity SBT has been minted directly to <span className="font-mono text-xs bg-indigo-50 text-indigo-600 p-1 rounded font-bold">{walletAddress?.slice(0, 10)}...</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mb-10 text-left">
           <Card className="p-6 space-y-4 border-slate-100 shadow-xl shadow-slate-50">
              <div className="flex items-center gap-3 text-indigo-600 mb-2">
                 <ShieldCheck size={20} /> <span className="text-sm font-black uppercase tracking-widest">Registry Profile</span>
              </div>
              <div className="space-y-3">
                 <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Identity Registry</div>
                    <a href={`https://sepolia.etherscan.io/address/${IDENTITY_REGISTRY_ADDR}`} target="_blank" className="text-xs font-mono font-bold text-slate-700 hover:text-indigo-600 flex items-center gap-1">
                       {IDENTITY_REGISTRY_ADDR.slice(0, 20)}... <ExternalLink size={10} />
                    </a>
                 </div>
                 <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">SBT Contract</div>
                    <a href={`https://sepolia.etherscan.io/address/${IDENTITY_SBT_ADDR}`} target="_blank" className="text-xs font-mono font-bold text-slate-700 hover:text-indigo-600 flex items-center gap-1">
                       {IDENTITY_SBT_ADDR.slice(0, 20)}... <ExternalLink size={10} />
                    </a>
                 </div>
              </div>
           </Card>

           <Card className="p-6 space-y-4 border-slate-100 shadow-xl shadow-slate-50">
              <div className="flex items-center gap-3 text-emerald-600 mb-2">
                 <Activity size={20} /> <span className="text-sm font-black uppercase tracking-widest">Atomic Transaction</span>
              </div>
              <div className="space-y-2">
                 {txHash && <RenderTxLink hash={txHash} label="View Registry Sync" />}
              </div>
           </Card>
        </div>

        <div className="flex gap-4">
           <Button variant="outline" onClick={() => setVerificationStatus(false)}>Re-verify</Button>
           <Button onClick={() => window.location.href = '/'}>Unlock Profile</Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight">Institutional Onboarding</h1>
        <p className="text-slate-500 text-lg">Identity-linked RWA compliance with Soulbound Tokens.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-10 relative overflow-hidden group border-slate-100 shadow-xl shadow-slate-50">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-indigo-500/10 transition-all duration-700"></div>
          
          <form onSubmit={handleOnboarding} className="relative z-10 space-y-8">
            <div className="flex items-start justify-between">
              <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-2xl shadow-indigo-200 logo-glow">
                <ShieldCheck size={32} />
              </div>
              <div className="px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm border bg-amber-50 text-amber-600 border-amber-100">
                 Mandatory Protocol Compliance
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     <User size={14} className="text-indigo-600" /> Organization Legal Name
                  </label>
                  <input 
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                    placeholder="e.g. Nexus Capital Group"
                    className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none text-slate-700 font-bold"
                  />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     <Globe size={14} className="text-indigo-600" /> Jurisdictional Country
                  </label>
                  <select 
                    value={formData.country}
                    onChange={e => setFormData({...formData, country: e.target.value})}
                    className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none bg-white text-slate-700 font-bold appearance-none"
                  >
                    <option>United Kingdom</option>
                    <option>United States</option>
                    <option>Singapore</option>
                    <option>Germany</option>
                  </select>
               </div>
               <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     <Hash size={14} className="text-indigo-600" /> Identity Registration ID
                  </label>
                  <input 
                    type="text"
                    required
                    value={formData.idNumber}
                    onChange={e => setFormData({...formData, idNumber: e.target.value})}
                    placeholder="e.g. CRN-992-X4"
                    className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none text-slate-700 font-bold"
                  />
               </div>
            </div>

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-16 text-lg font-black shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-transform"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <><Loader2 className="animate-spin" size={24} /> {status}</>
                ) : (
                  <><Zap size={24} className="fill-white" /> Verify & Mint SBT to Wallet</>
                )}
              </Button>
              
              <div className="mt-6 space-y-2">
                 <AnimatePresence>
                   {txHash && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><RenderTxLink hash={txHash} label="Atomic Registry Sync Tx" /></motion.div>}
                 </AnimatePresence>
              </div>
              
              <p className="text-center text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-[0.2em]">
                Treasury Sponsored Gas | Atomic Identity Mint
              </p>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
           <Card className="p-8 border-none bg-slate-900 text-white shadow-2xl shadow-indigo-100 relative overflow-hidden group rounded-[2rem]">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
              <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4">
                 <div className="w-14 h-14 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
                    <UserCheck size={28} className="text-indigo-400" />
                 </div>
                 <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Target Recipient Address</div>
                    <div className="text-xl font-black tracking-tighter">{walletAddress ? walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4) : 'Disconnected'}</div>
                 </div>
                 <div className="pt-4 flex items-center gap-4 text-[10px] font-black">
                    <span className="px-3 py-1 bg-white/5 rounded-xl uppercase border border-white/10 text-indigo-200">RWA ROLE: {role?.toUpperCase()}</span>
                 </div>
              </div>
           </Card>

           <Card className="p-8 space-y-6 border-slate-100 bg-white/50 backdrop-blur-md shadow-xl shadow-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                 <Info size={18} className="text-indigo-600" /> SBT Metadata
              </h3>
              <div className="space-y-4">
                 <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow-emerald"></div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter">ERC-5192 Soulbound (Locked)</div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow-emerald"></div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Identity-to-Wallet Proof</div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow-emerald"></div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter">On-chain Revocation Logic</div>
                 </div>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
};
