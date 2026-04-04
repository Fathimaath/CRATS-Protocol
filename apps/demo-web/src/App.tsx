import React from 'react';
import { useWorkflow } from './context/WorkflowContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Card, Button } from './components/UI';
import { Shield, Briefcase, Zap, Globe, Lock } from 'lucide-react';

const RoleCard = ({ type, title, desc, icon, onClick }: any) => (
  <Card className="p-8 group hover:border-indigo-500 transition-all duration-300 cursor-pointer hover:shadow-2xl hover:shadow-indigo-100" onClick={onClick}>
    <div className="flex flex-col items-center text-center gap-6">
      <div className="p-5 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
        {icon}
      </div>
      <div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      </div>
      <Button variant="secondary" className="w-full group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600">
        Enterprise Gateway
      </Button>
    </div>
  </Card>
);

function App() {
  const { role, setRole } = useWorkflow();

  if (role === 'none') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
        <div className="max-w-4xl w-full space-y-12 relative">
          <div className="text-center space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-full shadow-sm mb-4">
                <Zap size={14} className="text-amber-500 fill-amber-500" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Protocol v3.2 Live</span>
             </div>
             <h1 className="text-6xl font-black text-slate-900 tracking-tighter flex items-center justify-center gap-2">
               CRAT <span className="text-xl font-black uppercase tracking-[0.3em] text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">demo</span>
             </h1>
             <p className="text-slate-500 text-lg max-w-xl mx-auto">
               The institutional gateway for Real-World Asset tokenization and permissioned liquidity.
             </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <RoleCard 
              type="issuer"
              title="Asset Issuer"
              desc="Tokenize real estate, private equity, or credit portfolios with automated compliance."
              icon={<Briefcase size={32} />}
              onClick={() => setRole('issuer')}
            />
            <RoleCard 
              type="investor"
              title="Institutional Investor"
              desc="Access high-yield RWA vaults with multi-layer verification and instant settlement."
              icon={<Shield size={32} />}
              onClick={() => setRole('investor')}
            />
          </div>

          <div className="flex justify-center gap-12 pt-10">
             <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                <Globe size={14} /> Sepolia Testnet
             </div>
             <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                <Lock size={14} /> AES-256 Encrypted
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout />
  );
}

export default App;
