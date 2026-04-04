import React from 'react';
import { useWorkflow } from '../context/WorkflowContext';
import { Card } from '../components/UI';
import { motion } from 'framer-motion';
import { Building2, Wallet } from 'lucide-react';

export function RoleSelection() {
  const { setRole } = useWorkflow();

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center pt-24 pb-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
          Tokenize the World
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mx-auto">
          Experience the institutional-grade RWA lifecycle. Choose your path to see how assets are tokenized, managed, and traded.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-8 w-full px-4">
        <Card 
          onClick={() => setRole('issuer')}
          className="hover:border-indigo-200 transition-colors group p-8"
        >
          <div className="h-16 w-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 group-hover:scale-110 transition-transform">
            <Building2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Asset Issuer</h2>
          <p className="text-slate-500 min-h-[48px]">
            Tokenize real-world assets, handle compliance, and list on the marketplace.
          </p>
          <div className="mt-8 flex items-center text-sm font-medium text-indigo-600">
            Start Issuer Flow <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Card>

        <Card 
          onClick={() => setRole('investor')}
          className="hover:border-emerald-200 transition-colors group p-8"
        >
          <div className="h-16 w-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 text-emerald-600 group-hover:scale-110 transition-transform">
            <Wallet size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Investor</h2>
          <p className="text-slate-500 min-h-[48px]">
            Discover assets, invest securely via smart contracts, and trade peer-to-peer.
          </p>
          <div className="mt-8 flex items-center text-sm font-medium text-emerald-600">
            Start Investor Flow <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
