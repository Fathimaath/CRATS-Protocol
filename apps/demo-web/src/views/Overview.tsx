import React from 'react';
import { ShieldCheck, Activity, ArrowUpRight, BarChart3, Clock, ChevronRight, Zap } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { Card, Button } from '../components/UI';
import { motion } from 'framer-motion';

const StatCard = ({ icon, label, value, color }: any) => (
  <Card className="p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
    <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 opacity-10 transition-transform group-hover:scale-110 ${color}`}></div>
    <div className="flex flex-col gap-4 relative z-10">
      <div className={`p-2.5 w-fit rounded-xl ${color} bg-opacity-20`}>
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</div>
        <div className="text-2xl font-bold text-slate-900 leading-none">{value}</div>
      </div>
    </div>
  </Card>
);

export const Overview = () => {
  const { assets, verificationStatus, setActiveView, role } = useWorkflow();
  const [stats, setStats] = React.useState({ documents: 0, pors: 0, events: 0 });

  React.useEffect(() => {
    const loadStats = async () => {
      const { fetchRegistryStats } = await import('../blockchain/ethereum');
      const data = await fetchRegistryStats();
      setStats(data);
    };
    loadStats();
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">Institutional Dashboard</h1>
          <p className="text-slate-500">Welcome to the Nexus Protocol ecosystem.</p>
        </div>
        <button 
          onClick={() => setActiveView('verification')}
          className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-500 transition-all cursor-pointer group"
        >
           <div className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
             verificationStatus ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600 group-hover:bg-amber-100'
           }`}>
              Identity: {verificationStatus ? 'Verified' : 'Unverified'}
           </div>
           {!verificationStatus && <ChevronRight size={14} className="text-amber-500 mr-2" />}
        </button>
      </div>

      {/* Onboarding Banner */}
      {!verificationStatus && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 bg-gradient-to-r from-indigo-600 to-violet-700 rounded-[2.5rem] shadow-2xl shadow-indigo-200 text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="space-y-4 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest text-indigo-100">
                   <Zap size={12} /> Institutional Onboarding Required
                </div>
                <h2 className="text-3xl font-black tracking-tight">Sync Your Identity Registry</h2>
                <p className="text-indigo-100 text-lg max-w-xl leading-relaxed">
                   To begin {role === 'issuer' ? 'tokenizing assets' : 'purchasing yields'}, you must register your institutional credentials and mint an Identity SBT.
                </p>
             </div>
             <Button 
               onClick={() => setActiveView('verification')}
               className="bg-white text-indigo-700 hover:bg-slate-50 h-16 px-10 text-lg font-black shadow-xl shrink-0"
              >
               Complete KYC Verification
             </Button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<ShieldCheck className="text-indigo-600" />} 
          label="On-Chain Documents" 
          value={stats.documents || "8"} 
          color="bg-indigo-500" 
        />
        <StatCard 
          icon={<BarChart3 className="text-emerald-600" />} 
          label="Active Assets" 
          value={assets.length} 
          color="bg-emerald-500" 
        />
        <StatCard 
          icon={<Zap className="text-amber-600" />} 
          label="Audit / PoR Logs" 
          value={stats.pors + stats.events || "12"} 
          color="bg-amber-500" 
        />
        <StatCard 
          icon={<Activity className="text-rose-600" />} 
          label="Net Protocol APY" 
          value="8.2%" 
          color="bg-rose-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <Card className="lg:col-span-2 p-8 border-slate-100 shadow-xl shadow-slate-50 hover:shadow-indigo-50/50 transition-all duration-500">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-slate-900 tracking-tight">Recent Activity Stream</h3>
               <button className="text-indigo-600 text-xs font-black uppercase tracking-widest hover:underline flex items-center gap-1">
                  Explorer Logs <ArrowUpRight size={14} />
               </button>
            </div>
            <div className="space-y-6">
               {[
                 { t: 'Asset Tokenization', d: 'Azure Manor (AZURE) successfully minted', time: '2m ago', icon: <ArrowUpRight size={16} className="text-indigo-600" /> },
                 { t: 'Vault Finalized', d: 'vAZURE Primary Market now open', time: '14m ago', icon: <ArrowUpRight size={16} className="text-emerald-600" /> },
                 { t: 'Identity Minted', d: 'New Institutional Holder verified', time: '1h ago', icon: <ShieldCheck size={16} className="text-slate-600" /> },
               ].map((item, i) => (
                 <div key={i} className="flex items-start gap-4 p-5 hover:bg-slate-50/80 transition-all rounded-3xl border border-transparent hover:border-slate-100 group">
                    <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                       {item.icon}
                    </div>
                    <div className="flex-1">
                       <div className="text-base font-bold text-slate-800 tracking-tight mb-0.5">{item.t}</div>
                       <div className="text-xs text-slate-500 leading-normal">{item.d}</div>
                    </div>
                    <div className="text-[10px] items-center text-slate-400 font-black uppercase tracking-widest flex gap-1"><Clock size={12} /> {item.time}</div>
                 </div>
               ))}
            </div>
         </Card>

         <div className="space-y-6">
            <Card className="p-8 bg-slate-900 text-white border-none shadow-2xl shadow-indigo-100 relative overflow-hidden group">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
               <div className="relative z-10 space-y-6">
                  <ShieldCheck className="opacity-50 group-hover:scale-110 transition-transform" size={40} />
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Nexus Compliance</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-6 font-medium">
                      Your organization is operating under the UK-Compliance Framework. All RWA transfers are verified by the Atomic Swap Engine.
                    </p>
                  </div>
                  <Button variant="secondary" className="w-full py-4 text-xs font-bold uppercase tracking-widest border border-white/10 hover:bg-white hover:text-slate-900 transition-all">Audit Dashboard</Button>
               </div>
            </Card>

            <Card className="p-8 border-slate-100 shadow-xl shadow-slate-50">
               <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-200"></div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Network Node</h3>
               </div>
               <div className="space-y-4">
                  <div className="flex justify-between text-xs font-bold">
                     <span className="text-slate-400">Sepolia (11155111)</span>
                     <span className="text-emerald-600">ACTIVE</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-500 w-[98%] animate-pulse"></div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 font-bold uppercase italic opacity-60">Latency: 42ms</div>
               </div>
            </Card>
         </div>
      </div>
    </div>
  );
};
