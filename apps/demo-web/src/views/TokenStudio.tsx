import React, { useState } from 'react';
import { Database, Plus, CheckCircle, Loader2, FileText, ChevronRight, Activity, ExternalLink } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { Button, Card } from '../components/UI';
import { executeTokenizationFlow } from '../blockchain/ethereum';
import { motion } from 'framer-motion';

export const TokenStudio: React.FC = () => {
  const { addAsset, assets } = useWorkflow();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: 'Azure Manor',
    symbol: 'AZURE',
    supply: '10000000',
    nav: '10000000',
    category: 'REAL_ESTATE'
  });

  const handleTokenize = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('Deploying compliant AssetToken on Sepolia...');
    
    try {
      const { assetAddress, txHash } = await executeTokenizationFlow(
        formData.name,
        formData.symbol,
        formData.supply,
        formData.nav
      );

      setLastTxHash(txHash);

      const newAsset = {
        id: formData.symbol,
        name: formData.name,
        category: formData.category,
        supply: formData.supply,
        nav: `$${formData.nav}`,
        price: '$1.00',
        image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=600&auto=format&fit=crop',
        address: assetAddress,
        txHash: txHash
      };

      addAsset(newAsset);
      setStatus('Asset Tokenized & Minted to Treasury!');
      setTimeout(() => setShowSuccess(true), 1500);
    } catch (err: any) {
      console.error(err);
      setStatus('Error: ' + (err.message || 'Tokenization failed'));
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-emerald-100">
          <CheckCircle size={48} />
        </div>
        <p className="text-slate-500 mb-6 max-w-md text-lg leading-relaxed">
          {formData.name} has been successfully deployed. The initial supply has been minted to the protocol treasury.
        </p>
        
        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 mb-8 w-full max-w-md text-left">
           <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Institutional Asset Address</div>
           <div className="text-xs font-mono font-bold text-indigo-600 break-all select-all cursor-copy" title="Click to copy">
              {assets.find(a => a.id === formData.symbol)?.address}
           </div>
        </div>
        
        {lastTxHash && (
           <a 
             href={`https://sepolia.etherscan.io/tx/${lastTxHash}`} 
             target="_blank" 
             rel="noopener noreferrer"
             className="flex items-center gap-2 p-4 bg-slate-50 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-100 transition-all border border-slate-100 mb-10"
           >
             <Activity size={16} /> View Deployment Tx: {lastTxHash.slice(0, 20)}... <ExternalLink size={14} />
           </a>
        )}

        <div className="flex gap-4">
           <Button onClick={() => setShowSuccess(false)} variant="outline">Create Another Asset</Button>
           <Button onClick={() => window.location.href='/assets'}>Manage Portfolio</Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight">Tokenization Studio</h1>
        <p className="text-slate-500">Issue regulatory-compliant RWA tokens with automated registry sync.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-10 shadow-xl shadow-slate-50 border-slate-100">
          <form onSubmit={handleTokenize} className="space-y-8">
            <div className="grid grid-cols-2 gap-8 text-left">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Asset Name</label>
                <input 
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-medium"
                  placeholder="e.g. Azure Manor"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Token Symbol</label>
                <input 
                  type="text"
                  value={formData.symbol}
                  onChange={e => setFormData({...formData, symbol: e.target.value})}
                  className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-medium"
                  placeholder="e.g. AZURE"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 text-left">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Supply</label>
                <input 
                  type="number"
                  value={formData.supply}
                  onChange={e => setFormData({...formData, supply: e.target.value})}
                  className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-medium"
                  placeholder="10,000,000"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Initial NAV (USD)</label>
                <input 
                  type="number"
                  value={formData.nav}
                  onChange={e => setFormData({...formData, nav: e.target.value})}
                  className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-medium"
                  placeholder="1,000,000"
                  required
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Asset Category Plugin</label>
              <select 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none bg-white font-medium"
              >
                <option value="REAL_ESTATE">Institutional Real Estate (ERC-3643)</option>
                <option value="FINE_ART">Blue-chip Fine Art (ERC-3643)</option>
                <option value="CARBON">Carbon Credit Pool (ERC-3643)</option>
              </select>
            </div>

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-16 text-lg font-black shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-3">
                    <Loader2 className="animate-spin" size={24} />
                    {status}
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <Database size={24} />
                    Issue Compliant Asset
                  </span>
                )}
              </Button>
              
              {loading && lastTxHash && (
                <div className="mt-4">
                   <a href={`https://sepolia.etherscan.io/tx/${lastTxHash}`} target="_blank" className="text-[10px] font-black text-indigo-500 uppercase flex items-center justify-center gap-2 tracking-widest">
                      Live Deployment Logs <ExternalLink size={10} />
                   </a>
                </div>
              )}
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-8 bg-slate-50 border-dashed border-2 border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-indigo-600" /> Protocol Logic
            </h3>
            <div className="space-y-4">
               <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5"></div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">Deploys standard ERC-3643 Smart Contract</p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5"></div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">Configures Compliance & Identity Hooks</p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5"></div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">Atomically mints to Protocol Treasury</p>
               </div>
            </div>
          </Card>

          <Card className="p-8 space-y-6">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black shadow-inner shadow-indigo-100">1</div>
               <div className="text-sm font-black text-slate-800 tracking-tight">On-chain Issuance</div>
             </div>
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black shadow-inner shadow-indigo-100">2</div>
               <div className="text-sm font-black text-slate-800 tracking-tight">Registry Mapping</div>
             </div>
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black shadow-inner shadow-indigo-100">3</div>
               <div className="text-sm font-black text-slate-800 tracking-tight">Custody Setup</div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
