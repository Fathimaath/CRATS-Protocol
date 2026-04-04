import React, { useState, useEffect } from 'react';
import { useWorkflow } from '../context/WorkflowContext';
import { StepContainer } from '../components/StepContainer';
import { Button } from '../components/UI';
import { MOCK_ASSETS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';

function mockTransaction(): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const hash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
      resolve(hash);
    }, 1500);
  });
}

export function InvestorFlow() {
  const { currentStepId, markStepComplete, setCurrentStepId, steps } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHashes, setTxHashes] = useState<Record<number, string>>({});
  
  // Jump to step 9 if coming fresh as investor
  useEffect(() => {
    if (currentStepId < 9) {
      setCurrentStepId(9);
    }
  }, []);

  const handleAction = async (stepId: number) => {
    setIsProcessing(true);
    try {
      const hash = await mockTransaction();
      setTxHashes(prev => ({ ...prev, [stepId]: hash }));
      markStepComplete(stepId);
      
      const nextSteps: Record<number, number> = {
        9: 10, 10: 11, 11: 13, 13: 14
      };
      const nextStep = nextSteps[stepId];
      if (nextStep) setCurrentStepId(nextStep);

    } finally {
      setIsProcessing(false);
    }
  };

  const renderTxHash = (stepId: number) => {
    if (!txHashes[stepId]) return null;
    return (
      <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-mono text-slate-500">
        <span className="text-emerald-600 font-bold mr-2">✓ Success</span>
        <span className="opacity-70">Tx Hash:</span> {txHashes[stepId]}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-8 mb-32">
      <div className="mb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Investor Portal</h1>
            <p className="text-slate-500">Discover tokenized assets, invest securely, and trade.</p>
          </div>
          <div className="text-right border border-emerald-100 bg-emerald-50 text-emerald-800 rounded-2xl p-4">
             <div className="text-xs uppercase font-bold text-emerald-600">Available Balance</div>
             <div className="text-2xl font-light">$50,000 <span className="text-sm font-medium">USDC</span></div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        
        <StepContainer stepId={9} title="Investor Registry / KYC" description="Register your wallet and complete identity verification as an investor." actionText="Register & KYC" onAction={() => handleAction(9)} isProcessing={isProcessing}>
           <div className="flex gap-4">
             <div className="flex-1 p-4 border border-slate-200 rounded-xl bg-white flex items-center gap-4">
                <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">🏦</div>
                <div>
                  <div className="text-sm font-medium text-slate-800">Clearance Level 1</div>
                  <div className="text-xs text-slate-500">Retail Investor</div>
                </div>
             </div>
           </div>
           {renderTxHash(9)}
        </StepContainer>

        <StepContainer stepId={10} title="Investor SBT" description="Mint your non-transferable investor badge on-chain." actionText="Mint Investor SBT" onAction={() => handleAction(10)} isProcessing={isProcessing}>
           {renderTxHash(10)}
        </StepContainer>

        <StepContainer stepId={11} title="Primary Market Investment" description="Deposit capital directly into the Azure Manor Vault." actionText="Invest $10,000 USDC" onAction={() => handleAction(11)} isProcessing={isProcessing}>
          <div className="grid grid-cols-2 gap-4">
            {MOCK_ASSETS.map((asset, idx) => (
              <div key={asset.id} className={`p-1 rounded-2xl transition-all ${idx === 0 ? 'bg-gradient-to-br from-indigo-500 to-emerald-400 p-1 shadow-lg' : 'bg-white border border-slate-200'}`}>
                <div className="bg-white rounded-[14px] p-4 h-full relative overflow-hidden">
                  {idx === 0 && <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">SELECTED</div>}
                  <div className="h-32 bg-slate-100 rounded-lg mb-4 bg-cover bg-center" style={{ backgroundImage: `url(${asset.image})` }} />
                  <div className="font-bold text-slate-900">{asset.name}</div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-slate-500">Price</span>
                    <span className="font-medium">{asset.price}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">Est. APR</span>
                    <span className="font-medium text-emerald-600">{asset.apr}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {renderTxHash(11)}
        </StepContainer>

        <StepContainer stepId={13} title="Secondary Market Order" description="Place a buy order on the OrderBook Engine." actionText="Place Buy Order" onAction={() => handleAction(13)} isProcessing={isProcessing}>
           <div className="bg-slate-900 text-white p-6 rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
              <div className="relative z-10 flex justify-between items-center">
                 <div>
                    <div className="text-sm text-slate-400 mb-1">Buy Order</div>
                    <div className="text-3xl font-light">100 <span className="text-xl">vAZURE</span></div>
                 </div>
                 <div className="text-right">
                    <div className="text-sm text-slate-400 mb-1">Limit Price</div>
                    <div className="text-2xl font-mono text-indigo-400">$1.05</div>
                 </div>
              </div>
           </div>
           {renderTxHash(13)}
        </StepContainer>

        <StepContainer stepId={14} title="Clearing & Settlement" description="Match and settle the trade through the ClearingHouse." actionText="Mock Trade Settlement" onAction={() => handleAction(14)} isProcessing={isProcessing}>
          <div className="flex justify-center items-center py-8">
             <div className="text-center">
               <div className="w-16 h-16 bg-slate-100 rounded-full mx-auto flex items-center justify-center mb-2 shadow-inner text-2xl">👤</div>
               <div className="text-sm font-medium">Alice (Seller)</div>
               <div className="text-xs text-slate-500">-100 vAZURE</div>
             </div>
             
             <div className="px-8 flex flex-col items-center justify-center pt-4">
               {txHashes[14] ? (
                 <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-3xl">✅</motion.div>
               ) : (
                 <div className="text-xl opacity-50 animate-pulse">➡️</div>
               )}
               <div className="text-[10px] mt-2 font-mono text-slate-400 uppercase tracking-widest">ClearingHouse</div>
             </div>

             <div className="text-center">
               <div className="w-16 h-16 bg-indigo-50 rounded-full mx-auto flex items-center justify-center mb-2 shadow-inner text-2xl">👤</div>
               <div className="text-sm font-medium">You (Buyer)</div>
               <div className="text-xs text-emerald-600 font-bold">+100 vAZURE</div>
             </div>
          </div>
          {renderTxHash(14)}
          
          <AnimatePresence>
            {txHashes[14] && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="mt-8 p-6 bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl text-center text-white shadow-xl"
              >
                <div className="text-4xl mb-4">🏆</div>
                <h3 className="text-2xl font-bold mb-2">Protocol Lifecycle Complete</h3>
                <p className="text-slate-300 max-w-md mx-auto">
                  You have successfully witnessed the entire institutional real-world asset flow from identity registration to atomic settlement.
                </p>
                <Button variant="secondary" className="mt-6 mx-auto" onClick={() => window.location.reload()}>
                  Start Over
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </StepContainer>

      </div>
    </div>
  );
}
