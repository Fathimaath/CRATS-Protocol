import React, { useState } from 'react';
import { useWorkflow } from '../context/WorkflowContext';
import { StepContainer } from '../components/StepContainer';
import { executeStep1, executeStep3, executeStep4 } from '../blockchain/hardhat';

function mockTransaction(): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const hash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
      resolve(hash);
    }, 1500);
  });
}

export function IssuerFlow() {
  const { currentStepId, markStepComplete, setCurrentStepId } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [txDetails, setTxDetails] = useState<Record<number, any>>({});

  const handleAction = async (stepId: number) => {
    setIsProcessing(true);
    try {
      let res: any = { hash: await mockTransaction() };
      
      if (stepId === 1) res = await executeStep1();
      else if (stepId === 3) res = await executeStep3();
      else if (stepId === 4) res = await executeStep4();

      setTxDetails(prev => ({ ...prev, [stepId]: res }));
      markStepComplete(stepId);
      
      // Advance to next step for Issuer
      const nextSteps: Record<number, number> = {
        1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 12
      };
      const nextStep = nextSteps[stepId];
      if (nextStep) setCurrentStepId(nextStep);

    } finally {
      setIsProcessing(false);
    }
  };

  const renderTxHash = (stepId: number) => {
    if (!txDetails[stepId]) return null;
    const details = txDetails[stepId];
    return (
      <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-mono text-slate-500 break-all">
        <div className="flex items-center text-emerald-600 font-bold mb-1">
          ✓ {details.existing ? 'Success (Already Exists)' : 'Success'}
        </div>
        <div><span className="opacity-70">Tx Hash:</span> {details.hash}</div>
        {details.tokenId && (
           <div className="mt-1"><span className="opacity-70">Token ID:</span> {details.tokenId}</div>
        )}
        {details.contract && (
           <div className="mt-1"><span className="opacity-70">Contract:</span> {details.contract}</div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-8 mb-32">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Issuer Portal</h1>
        <p className="text-slate-500">Tokenize your real-world assets and configure financial products.</p>
      </div>

      <div className="space-y-4">
        {/* Layer 1 */}
        <StepContainer stepId={1} title="Identity Registry" description="Register your wallet as an authorized issuer on the protocol." actionText="Connect Wallet & Register" onAction={() => handleAction(1)} isProcessing={isProcessing}>
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-600">
            <strong>Connected Wallet:</strong> 0xf39F...92266
            <br /><strong>Role Requested:</strong> Issuer (Role ID: 4)
          </div>
          {renderTxHash(1)}
        </StepContainer>

        <StepContainer stepId={2} title="KYC Verification" description="Complete KYC with an external provider (mocked)." actionText="Complete KYC" onAction={() => handleAction(2)} isProcessing={isProcessing}>
          <div className="flex gap-4">
            <div className="w-1/2 p-4 border border-slate-200 rounded-xl bg-white text-center">
              <div className="text-3xl mb-2">📄</div>
              <div className="text-sm font-semibold text-slate-700">Identity Doc</div>
              <div className="text-xs text-emerald-600">Verified</div>
            </div>
            <div className="w-1/2 p-4 border border-slate-200 rounded-xl bg-white text-center">
              <div className="text-3xl mb-2">🏢</div>
              <div className="text-sm font-semibold text-slate-700">Entity Check</div>
              <div className="text-xs text-emerald-600">Verified</div>
            </div>
          </div>
        </StepContainer>

        <StepContainer stepId={3} title="Identity SBT Minting" description="Mint your Soulbound Token to prove your verified status on-chain." actionText="Mint Identity SBT" onAction={() => handleAction(3)} isProcessing={isProcessing}>
           {renderTxHash(3)}
        </StepContainer>

        {/* Layer 2 */}
        <StepContainer stepId={4} title="Tokenize Asset" description="Deploy the AssetToken contract for your property." actionText="Tokenize Asset" onAction={() => handleAction(4)} isProcessing={isProcessing}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Asset Name</label>
              <input type="text" value="Azure Manor" readOnly className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Token Symbol</label>
              <input type="text" value="AZURE" readOnly className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Total Supply</label>
              <input type="text" value="10,000,000" readOnly className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Category</label>
              <input type="text" value="REAL_ESTATE" readOnly className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
          {renderTxHash(4)}
        </StepContainer>

        <StepContainer stepId={5} title="Document Registry" description="Attach legal documents to your tokenized asset." actionText="Register Documents" onAction={() => handleAction(5)} isProcessing={isProcessing}>
          <div className="flex gap-2 items-center text-sm text-slate-600 bg-slate-50 py-2 px-4 rounded-lg border border-slate-200 mb-2">
            <span>📎</span> TitleDeed.pdf (ipfs://QmAz...)
          </div>
          <div className="flex gap-2 items-center text-sm text-slate-600 bg-slate-50 py-2 px-4 rounded-lg border border-slate-200">
            <span>📎</span> Appraisal.pdf (ipfs://QmA2...)
          </div>
          {renderTxHash(5)}
        </StepContainer>

        <StepContainer stepId={6} title="Oracle NAV Configuration" description="Set the initial Net Asset Value per token." actionText="Configure NAV" onAction={() => handleAction(6)} isProcessing={isProcessing}>
           <div className="text-3xl font-light text-slate-800">$1.00 <span className="text-sm font-medium text-slate-500">per AZURE</span></div>
           {renderTxHash(6)}
        </StepContainer>

        <StepContainer stepId={7} title="Mint to Treasury" description="Mint the initial token supply to your treasury wallet." actionText="Mint 10M Tokens" onAction={() => handleAction(7)} isProcessing={isProcessing}>
           <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mt-4">
             <div className="h-full bg-indigo-500 w-full"></div>
           </div>
           {renderTxHash(7)}
        </StepContainer>

        {/* Layer 3 */}
        <StepContainer stepId={8} title="Vault Creation" description="Create an ERC-4626 SyncVault for investors to deposit into." actionText="Create SyncVault" onAction={() => handleAction(8)} isProcessing={isProcessing}>
           <div className="p-4 border border-indigo-100 bg-indigo-50/50 rounded-xl">
             <div className="font-semibold text-indigo-900">vAZURE Vault</div>
             <div className="text-sm text-indigo-700 mt-1">Accepts USDC, distributes vAZURE shares.</div>
           </div>
           {renderTxHash(8)}
        </StepContainer>

        <StepContainer stepId={12} title="Yield Distribution" description="Distribute monthly rental income to vault shareholders." actionText="Distribute Yield" onAction={() => handleAction(12)} isProcessing={isProcessing}>
           <div className="text-3xl font-light text-emerald-600">+$1,000 <span className="text-sm font-medium text-slate-500">Rental Income</span></div>
           {renderTxHash(12)}
           {txDetails[12] && (
             <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 py-6 text-center rounded-xl font-medium text-emerald-800">
               Issuer Flow Complete! 🎉<br/>
               <span className="text-sm font-normal text-emerald-600 mt-2 block">Switch to the Investor role to continue the journey.</span>
             </div>
           )}
        </StepContainer>

      </div>
    </div>
  );
}
