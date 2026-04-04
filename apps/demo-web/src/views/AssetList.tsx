import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, ExternalLink, ShieldCheck, Share2, Loader2, X, Database, Globe, LayoutGrid } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { Button, Card } from '../components/UI';
import { createVaultForAsset, executeTokenizationFlow } from '../blockchain/ethereum';

export const AssetList: React.FC = () => {
  const { assets, listAsset, addAsset, verificationStatus } = useWorkflow();
  const [listingId, setListingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [issueStatus, setIssueStatus] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    supply: '10000000',
    nav: '10000000',
    category: 'REAL_ESTATE'
  });

  const handleList = async (id: string, address?: string) => {
    if (!address) {
      alert("Asset address not found. Please re-tokenize or check blockchain.");
      return;
    }
    setListingId(id);
    try {
      const vaultAddress = await createVaultForAsset(address);
      listAsset(id, vaultAddress);
    } catch (err: any) {
      console.error(err);
      alert("Listing Failed: " + (err.message || "Blockchain error"));
    } finally {
      setListingId(null);
    }
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsIssuing(true);
    setIssueStatus('Deploying AssetToken on Sepolia...');
    try {
      const { assetAddress, txHash } = await executeTokenizationFlow(
        formData.name,
        formData.symbol,
        formData.supply,
        formData.nav
      );

      const newAsset = {
        id: formData.symbol,
        name: formData.name,
        category: formData.category,
        supply: formData.supply,
        nav: `$${parseFloat(formData.nav).toLocaleString()}`,
        price: '$1.00',
        image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=600&auto=format&fit=crop',
        address: assetAddress,
        txHash: txHash
      };

      addAsset(newAsset);
      setIssueStatus('Success! Asset Ready.');
      setTimeout(() => setShowCreateModal(false), 2000);
    } catch (err: any) {
      console.error(err);
      setIssueStatus('Error: ' + (err.message || 'Issuance failed'));
    } finally {
      setIsIssuing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight tracking-tight">Institutional Assets</h1>
          <p className="text-slate-500">Manage and distribute your RWA token inventory.</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 shadow-xl shadow-indigo-100 logo-glow py-4 px-6 rounded-2xl">
           <Plus size={20} /> Create New Asset
        </Button>
      </div>

      {!verificationStatus && (
        <Card className="p-6 bg-amber-50 border-amber-200 border-2 border-dashed flex items-center justify-between">
           <div className="flex items-center gap-4 text-amber-800">
              <ShieldCheck size={24} className="text-amber-600" />
              <div>
                 <div className="font-bold">Identity Verification Pending</div>
                 <div className="text-xs opacity-80">You can issue assets, but marketplace listing requires a verified Institutional SBT.</div>
              </div>
           </div>
           <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-widest">Complete KYC</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {assets.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
            <Building2 className="text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-bold">No assets tokenized yet.</p>
            <p className="text-slate-400 text-sm mt-1">Click "Create New Asset" to begin issuance.</p>
          </div>
        ) : (
          assets.map((asset) => (
            <motion.div 
              key={asset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden group hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-500 border-slate-100 rounded-[2rem]">
                <div className="h-48 overflow-hidden relative">
                  <img src={asset.image} alt={asset.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm">
                    {asset.category}
                  </div>
                </div>
                
                <div className="p-8 space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight">{asset.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{asset.id}</span>
                       <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Supply: {asset.supply}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 py-5 border-y border-slate-50">
                    <div>
                      <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Asset NAV</div>
                      <div className="text-lg font-black text-slate-800 tracking-tight">{asset.nav}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Status</div>
                      <div className={`text-sm font-black uppercase tracking-widest ${asset.isListed ? 'text-emerald-600' : 'text-amber-500'}`}>
                         {asset.isListed ? 'Marketplace Live' : 'In Treasury'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    {asset.isListed ? (
                      <div className="flex items-center justify-between bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                         <div className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                            <ShieldCheck size={16} /> Listed on Nexus
                         </div>
                         <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                            <Share2 size={18} />
                         </button>
                      </div>
                    ) : (
                      <Button 
                        onClick={() => handleList(asset.id, asset.address)} 
                        className="w-full h-14 flex items-center justify-center gap-2 font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-50"
                        disabled={listingId === asset.id || !verificationStatus}
                      >
                        {listingId === asset.id ? (
                          <><Loader2 className="animate-spin" size={18} /> Deploying Vault...</>
                        ) : (
                          <>{verificationStatus ? <><Plus size={18} /> List to Marketplace</> : <><ShieldCheck size={18} /> Verified Access Only</>}</>
                        )}
                      </Button>
                    )}
                  </div>
                  
                  <div className="pt-2 space-y-1">
                    {asset.txHash && (
                      <a 
                        href={`https://sepolia.etherscan.io/tx/${asset.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-indigo-500 transition-colors uppercase tracking-[0.2em]"
                      >
                        <ExternalLink size={10} /> Issuance Explorer
                      </a>
                    )}
                    {asset.vaultAddress && (
                      <a 
                        href={`https://sepolia.etherscan.io/address/${asset.vaultAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 text-[9px] font-black text-indigo-500 hover:text-indigo-600 transition-colors uppercase tracking-[0.2em]"
                      >
                        <ExternalLink size={10} /> Vault Explorer
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Issuance Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
               onClick={() => !isIssuing && setShowCreateModal(false)}
            />
            <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="w-full max-w-xl relative z-10"
            >
              <Card className="p-0 border-none shadow-3xl overflow-hidden rounded-[2.5rem]">
                 <div className="p-8 bg-indigo-600 text-white flex items-center justify-between logo-glow">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
                          <Database size={24} />
                       </div>
                       <div>
                          <h2 className="text-xl font-black tracking-tight leading-none mb-1">Asset Tokenizer</h2>
                          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Issue Regulatory-Compliant ERC-3643</div>
                       </div>
                    </div>
                    <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                       <X size={20} />
                    </button>
                 </div>

                 <form onSubmit={handleIssue} className="p-10 space-y-8 bg-white">
                    <div className="grid grid-cols-2 gap-8">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Asset Legal Name</label>
                          <input 
                            type="text" required
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-bold text-slate-900"
                            placeholder="e.g. Azure Manor"
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ticker Symbol</label>
                          <input 
                            type="text" required
                            value={formData.symbol}
                            onChange={e => setFormData({...formData, symbol: e.target.value})}
                            className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-bold text-slate-900 uppercase"
                            placeholder="e.g. AZURE"
                          />
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Asset Supply</label>
                          <div className="relative">
                             <LayoutGrid className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                             <input 
                               type="number" required
                               value={formData.supply}
                               onChange={e => setFormData({...formData, supply: e.target.value})}
                               className="w-full p-4 pl-12 rounded-2xl border border-slate-100 bg-slate-50 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-bold text-slate-900"
                             />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Initial NAV (USD)</label>
                          <div className="relative">
                             <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                             <input 
                               type="number" required
                               value={formData.nav}
                               onChange={e => setFormData({...formData, nav: e.target.value})}
                               className="w-full p-4 pl-12 rounded-2xl border border-slate-200 bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-bold text-slate-900"
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Compliance Plugin</label>
                       <select 
                          value={formData.category}
                          onChange={e => setFormData({...formData, category: e.target.value})}
                          className="w-full p-4 rounded-2xl border border-slate-200 bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none font-bold text-slate-900 appearance-none"
                       >
                          <option value="REAL_ESTATE">Institutional Real Estate Framework</option>
                          <option value="FINE_ART">Blue-chip Fine Art Protection</option>
                          <option value="CARBON">Global Carbon Credit Standard</option>
                       </select>
                    </div>

                    <div className="pt-4 space-y-4">
                       <Button 
                         type="submit" 
                         className="w-full h-16 text-lg font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl shadow-indigo-100"
                         disabled={isIssuing}
                       >
                         {isIssuing ? (
                           <><Loader2 className="animate-spin" size={24} /> {issueStatus}</>
                         ) : (
                           <><ShieldCheck size={24} /> Issue Asset on Sepolia</>
                         )}
                       </Button>
                       <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                          Atomic Compliance Registry Sync
                       </p>
                    </div>
                 </form>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
