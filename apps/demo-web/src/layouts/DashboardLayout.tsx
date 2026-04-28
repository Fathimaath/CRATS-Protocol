import { Sidebar } from '../components/Sidebar';
import { useWorkflow } from '../context/WorkflowContext';
import { Overview } from '../views/Overview';
import { Verification } from '../views/Verification';
import { TokenStudio } from '../views/TokenStudio';
import { AssetList } from '../views/AssetList';
import { Marketplace } from '../views/Marketplace';
import { Transparency } from '../views/Transparency';
import { Card, Button } from '../components/UI';
import { Wallet, Shield, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const DashboardLayout = () => {
  const { activeView, walletAddress, connectWallet } = useWorkflow();

  const renderView = () => {
    switch (activeView) {
      case 'overview': return <Overview />;
      case 'verification': return <Verification />;
      case 'tokenize': return <TokenStudio />;
      case 'assets': return <AssetList />;
      case 'marketplace': return <Marketplace />;
      case 'transparency': return <Transparency />;
      default: return <Overview />;
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen text-slate-900 relative overflow-hidden">
      {/* Sidebar navigation */}
      <Sidebar />
      
      {/* Main content area */}
      <main className="flex-1 p-10 overflow-y-auto max-h-screen relative z-10">
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </main>

      {/* Wallet Connection Overlay */}
      <AnimatePresence>
        {!walletAddress && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full"
            >
              <Card className="p-10 border-none shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
                
                <div className="relative z-10 text-center space-y-8">
                  <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white mx-auto shadow-xl shadow-indigo-200 animate-bounce-subtle">
                    <Wallet size={40} />
                  </div>
                  
                  <div>
                    <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Connect Gateway</h2>
                    <p className="text-slate-500">Authorized access required for Nexus Institutional Dashboard.</p>
                  </div>

                  <div className="space-y-4">
                    <Button 
                      onClick={connectWallet}
                      className="w-full h-14 text-lg font-bold shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-transform"
                    >
                      <Zap size={20} className="fill-white" />
                      Connect Institutional Wallet
                    </Button>
                    <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Shield size={12} /> SECP256K1 Encrypted
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
