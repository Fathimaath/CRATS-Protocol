import React from 'react';
import { LayoutDashboard, Wallet, PlusCircle, ShoppingCart, Settings, ShieldCheck, User, LogOut, CheckCircle2 } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string;
  badgeColor?: string;
}

const SidebarItem = ({ icon, label, active, onClick, badge, badgeColor }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
      active 
        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 font-bold' 
        : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
    }`}
  >
    <div className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600 transition-colors'}`}>
      {React.cloneElement(icon as any, { size: 20 })}
    </div>
    <span className="text-sm flex-1 text-left tracking-tight">{label}</span>
    {badge && (
      <span className={`px-2 py-0.5 text-[9px] rounded-full font-black uppercase tracking-widest ${badgeColor || 'bg-emerald-100 text-emerald-700'}`}>
        {badge}
      </span>
    )}
  </button>
);

export const Sidebar = () => {
  const { activeView, setActiveView, role, walletAddress, setRole, verificationStatus } = useWorkflow();

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <aside className="w-64 border-r border-slate-200 bg-white h-screen flex flex-col p-6 sticky top-0 overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-3 mb-10 px-2 group cursor-pointer" onClick={() => setActiveView('overview')}>
        <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white logo-glow font-black italic text-xl group-hover:scale-110 transition-transform">C</div>
        <div className="flex items-baseline gap-1">
          <span className="font-black text-2xl tracking-tighter text-slate-900">CRAT</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">demo</span>
        </div>
      </div>

      <div className="flex-1 space-y-1">
        <div className="px-3 mb-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-60">Main Menu</div>
        <SidebarItem 
          icon={<LayoutDashboard />} 
          label="Overview" 
          active={activeView === 'overview'} 
          onClick={() => setActiveView('overview')} 
        />
        <SidebarItem 
          icon={<Wallet />} 
          label="Institutional Assets" 
          active={activeView === 'assets'} 
          onClick={() => setActiveView('assets')} 
        />
        
        {role === 'issuer' && (
          <SidebarItem 
            icon={<PlusCircle />} 
            label="Token Studio" 
            active={activeView === 'tokenize'} 
            onClick={() => setActiveView('tokenize')} 
          />
        )}

        <SidebarItem 
          icon={<ShoppingCart />} 
          label="Marketplace" 
          active={activeView === 'marketplace'} 
          onClick={() => setActiveView('marketplace')} 
        />

        <SidebarItem 
          icon={<LayoutDashboard />} 
          label="Transparency Hub" 
          active={activeView === 'transparency'} 
          onClick={() => setActiveView('transparency')} 
          badge="Audit Live"
        />
      </div>

      <div className="mt-8 space-y-1">
        <div className="px-3 mb-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-60">Security & Compliance</div>
        <SidebarItem 
          icon={<ShieldCheck />} 
          label="Verification" 
          active={activeView === 'verification'} 
          onClick={() => setActiveView('verification')} 
          badge={verificationStatus ? 'Verified' : 'Pending'}
          badgeColor={verificationStatus ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-amber-100 text-amber-700 font-bold'}
        />
        <SidebarItem 
          icon={<Settings />} 
          label="System Settings" 
          active={activeView === 'settings'} 
          onClick={() => setActiveView('settings')} 
        />
        
        <div className="mt-10 p-5 bg-slate-900 rounded-[2rem] text-white shadow-2xl shadow-indigo-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-indigo-500/40 transition-all duration-700"></div>
          
          <div className="flex items-center gap-3 mb-4 relative z-10">
             <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 shadow-inner relative">
                <User size={18} className="text-indigo-400" />
                {verificationStatus && (
                  <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full border-2 border-slate-900 p-0.5">
                    <CheckCircle2 size={8} className="text-white" />
                  </div>
                )}
             </div>
             <div className="overflow-hidden">
                <div className="text-[10px] font-black truncate tracking-tight text-slate-100">{walletAddress ? truncateAddress(walletAddress) : 'Disconnected'}</div>
                <div className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.1em] opacity-80">{role || 'Select Role'}</div>
             </div>
          </div>
          
          <button 
            onClick={() => {
              setRole(null);
              window.location.reload();
            }}
            className="w-full py-2.5 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 transition-all rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-700 hover:border-rose-500/30"
          >
            <LogOut size={12} /> Disconnect Profile
          </button>
        </div>
      </div>
    </aside>
  );
};
