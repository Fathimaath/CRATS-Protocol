import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Shield, 
  Briefcase, 
  Zap, 
  Wallet,
  Activity,
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  History,
  Info,
  Package,
  Plus
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

// --- UI Components ---

const Card = ({ children, className = '', onClick }) => (
  <div className={`glass-card ${className}`} onClick={onClick}>
    {children}
  </div>
);

const Button = ({ children, onClick, disabled, className = '' }) => (
  <button className={`btn ${className}`} onClick={onClick} disabled={disabled}>
    {children}
  </button>
);

const StepContainer = ({ id, title, description, children, actionText, onAction, isProcessing, currentStep, isComplete }) => (
  <div className={`step-card p-6 ${id === currentStep ? 'active-step' : ''}`}>
    <div className="flex justify-between items-start mb-4">
      <div className="flex gap-4">
        <div className={`step-number ${isComplete ? 'num-complete' : id === currentStep ? 'num-active' : ''}`}>
          {isComplete ? '✓' : id}
        </div>
        <div>
          <h4 className="text-lg font-bold">{title}</h4>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      {id === currentStep && !isComplete && (
        <Button onClick={onAction} disabled={isProcessing} className="py-2 px-4 text-xs">
          {isProcessing ? <Loader2 className="animate-spin" size={14} /> : actionText}
        </Button>
      )}
    </div>
    {(id === currentStep || isComplete) && (
      <div className="mt-4 pt-4 border-t border-white/5">
        {children}
      </div>
    )}
  </div>
);

function App() {
  const [role, setRole] = useState('none'); 
  const [user, setUser] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [txDetails, setTxDetails] = useState({});
  const [username, setUsername] = useState('');
  const [tokenParams, setTokenParams] = useState({ name: 'Azure Manor', symbol: 'AZURE', supply: '1000', category: 'REAL_ESTATE' });
  const [activityLogs, setActivityLogs] = useState([
    { id: 1, type: 'info', message: 'System Gateway Connected. Fireblocks MPC Layer Online.', time: new Date().toLocaleTimeString() }
  ]);

  useEffect(() => {
    const savedUser = localStorage.getItem('crats_user');
    if (savedUser) {
      const u = JSON.parse(savedUser);
      setUser(u);
      if (u.kyc_status !== 'COMPLETED') setCurrentStep(2);
      else setCurrentStep(4);
      fetchAssets(u.id);
      addLog(`Session restored for ${u.username}`, 'info');
    }
  }, []);

  const addLog = (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setActivityLogs(prev => [{ id, type, message, time: new Date().toLocaleTimeString() }, ...prev]);
  };

  const fetchAssets = async (userId) => {
    try {
      const res = await axios.get(`${API_BASE}/assets/${userId}`);
      setAssets(res.data);
    } catch (err) {
      console.error('Failed to fetch assets');
    }
  };

  const handleAction = async (stepId, actionFn) => {
    setLoading(true);
    addLog(`Initiating Step ${stepId}...`, 'info');
    try {
      const res = await actionFn();
      setTxDetails(prev => ({ ...prev, [stepId]: res }));
      addLog(`Step ${stepId} Success. Fireblocks TX ID: ${res.transaction_id || 'N/A'}`, 'success');
      if (stepId === 4 && user) fetchAssets(user.id);
      setCurrentStep(stepId + 1);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      addLog(`Step ${stepId} Failed: ${errMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    const res = await axios.post(`${API_BASE}/register`, { username });
    setUser(res.data);
    localStorage.setItem('crats_user', JSON.stringify(res.data));
    return res.data;
  };

  const completeKYC = async () => {
    const res = await axios.post(`${API_BASE}/kyc`, { userId: user.id });
    const updated = { ...user, kyc_status: 'COMPLETED', sbt_minted: true };
    setUser(updated);
    localStorage.setItem('crats_user', JSON.stringify(updated));
    return res.data;
  };

  const tokenizeAsset = async () => {
    const res = await axios.post(`${API_BASE}/tokenize`, { 
      userId: user.id,
      ...tokenParams
    });
    return res.data;
  };

  const listAsset = async (asset) => {
    const res = await axios.post(`${API_BASE}/list`, {
      userId: user.id,
      assetTokenAddress: asset.token_address || '0x0b8382a092A68e6C81611a80dDdfb68C9f07f6e6', // Use the one we found if blank
      name: asset.name,
      symbol: asset.symbol,
      category: asset.category
    });
    return res.data;
  };

  if (role === 'none') {
    return (
      <div className="home-container flex flex-col items-center justify-center p-6 min-vh-100" style={{minHeight:'90vh'}}>
        <div className="max-w-4xl w-full space-y-12">
          <div className="text-center">
             <div className="badge-live mb-4">
                <Zap size={14} style={{ color: '#fbbf24' }} />
                <span>Institutional Mainnet Gateway</span>
             </div>
             <h1 className="title-main mb-4">
               CRAT <span className="title-tag">Protocol</span>
             </h1>
             <p className="text-muted text-lg max-w-xl mx-auto">
               Secure Real-World Asset tokenization powered by Fireblocks MPC Infrastructure.
             </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <Card className="p-8 group cursor-pointer text-center" onClick={() => setRole('issuer')}>
              <div className="flex flex-col items-center gap-6">
                <div className="role-icon-wrapper"><Briefcase size={32} /></div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Asset Issuer</h3>
                  <p className="text-muted text-sm">Tokenize and manage institutional RWA portfolios.</p>
                </div>
                <div className="btn-outline w-full">Access Terminal</div>
              </div>
            </Card>
            <Card className="p-8 group cursor-pointer text-center" onClick={() => setRole('investor')}>
              <div className="flex flex-col items-center gap-6">
                <div className="role-icon-wrapper"><Shield size={32} /></div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Qualified Investor</h3>
                  <p className="text-muted text-sm">Deploy capital into verified institutional vaults.</p>
                </div>
                <div className="btn-outline w-full">Enter Gateway</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container max-w-5xl mx-auto py-12 px-6">
      <header className="header flex justify-between items-center mb-12 pb-8">
        <div>
          <button onClick={() => setRole('none')} className="btn-back mb-2">
            ← Logout & Return Home
          </button>
          <h2 className="text-3xl font-black uppercase tracking-tight">{role} Terminal</h2>
        </div>
        {user && (
          <div className="flex gap-4 items-center">
            <div className="text-right">
              <div className="text-xs font-bold text-primary uppercase">Vault: {user.username}</div>
              <div className="text-addr">{user.wallet_address.slice(0,10)}...{user.wallet_address.slice(-8)}</div>
            </div>
            <div className="icon-wallet-bg">
              <Wallet size={24} />
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-3 gap-8">
        {/* Main Process */}
        <div className="col-span-2 space-y-6">
          <StepContainer 
            id={1} 
            title="Institutional Onboarding" 
            description="Creation of MPC vault and generation of multi-sig deposit addresses."
            actionText="Initialize Vault"
            onAction={() => handleAction(1, register)}
            isProcessing={loading}
            currentStep={currentStep}
            isComplete={!!user}
          >
            {!user ? (
              <div className="max-w-sm">
                <label className="label-xs mb-2">Entity Legal Name</label>
                <input className="input" placeholder="e.g. Azure Real Estate Fund" value={username} onChange={(e)=>setUsername(e.target.value)} />
              </div>
            ) : (
              <div className="info-box flex justify-between items-center bg-emerald-500/5 border-emerald-500/20">
                <div>
                  <div className="label-xs">Fireblocks Vault ID</div>
                  <div className="font-mono text-sm">{user.vault_id}</div>
                </div>
                <div className="text-right">
                  <div className="label-xs">Deposit Address (Sepolia)</div>
                  <div className="text-addr">{user.wallet_address}</div>
                </div>
              </div>
            )}
          </StepContainer>

          <StepContainer 
            id={2} 
            title="KYB & Regulatory Compliance" 
            description="Registry verification and minting of institutional Soulbound Token (SBT)."
            actionText="Submit Compliance"
            onAction={() => handleAction(2, completeKYC)}
            isProcessing={loading}
            currentStep={currentStep}
            isComplete={user?.kyc_status === 'COMPLETED'}
          >
            <div className="grid grid-cols-2 gap-4">
               <div className="compliance-card">
                  <div className="label-xs mb-1">Status</div>
                  <div className="text-success-xs flex items-center gap-1">
                    <Shield size={10} /> Verified by CRATS Admin
                  </div>
               </div>
               <div className="compliance-card">
                  <div className="label-xs mb-1">SBT Metadata</div>
                  <div className="text-xs text-muted">Role: INSTITUTIONAL_ISSUER</div>
               </div>
            </div>
          </StepContainer>

          <StepContainer 
            id={3} 
            title="Issuer Authorization" 
            description="Delegating VAULT_CREATOR and ASSET_MANAGER roles to the MPC vault."
            actionText="Request Authorization"
            onAction={() => handleAction(3, async () => ({ transaction_id: 'internal_role_grant' }))}
            isProcessing={loading}
            currentStep={currentStep}
            isComplete={currentStep > 3}
          >
            <div className="info-box flex items-center gap-3">
               <Info size={16} className="text-primary" />
               <div className="text-xs text-muted">Awaiting protocol admin to confirm role delegation in the Registry.</div>
            </div>
          </StepContainer>

          <StepContainer 
            id={4} 
            title="Asset Tokenization" 
            description="Deployment of a regulatory-grade ERC-3643 compliant smart contract."
            actionText="Deploy Asset"
            onAction={() => handleAction(4, tokenizeAsset)}
            isProcessing={loading}
            currentStep={currentStep}
            isComplete={currentStep > 4}
          >
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="data-box">
                <label className="label-xs mb-1">Asset Name</label>
                <input className="input-s" value={tokenParams.name} onChange={(e)=>setTokenParams({...tokenParams, name: e.target.value})} />
              </div>
              <div className="data-box">
                <label className="label-xs mb-1">Symbol</label>
                <input className="input-s" value={tokenParams.symbol} onChange={(e)=>setTokenParams({...tokenParams, symbol: e.target.value})} />
              </div>
              <div className="data-box">
                <label className="label-xs mb-1">Initial Supply</label>
                <input className="input-s" type="number" value={tokenParams.supply} onChange={(e)=>setTokenParams({...tokenParams, supply: e.target.value})} />
              </div>
              <div className="data-box">
                <label className="label-xs mb-1">Category</label>
                <select className="input-s" value={tokenParams.category} onChange={(e)=>setTokenParams({...tokenParams, category: e.target.value})}>
                  <option value="REAL_ESTATE">Real Estate</option>
                  <option value="FINE_ART">Fine Art</option>
                  <option value="COMMODITY">Commodity</option>
                </select>
              </div>
            </div>
            
            {txDetails[4] && (
              <div className="p-4 info-box-success">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase">Institutional Treasury Mint</span>
                  <span className="text-xs font-mono">{txDetails[4].transaction_id.slice(0,12)}...</span>
                </div>
                <div className="text-[10px] mt-2 opacity-70">Tokens minted to Treasury for custody. Asset added to inventory.</div>
              </div>
            )}
          </StepContainer>

          {currentStep >= 5 && assets.length > 0 && (
            <StepContainer 
              id={5} 
              title="Vault Listing" 
              description="Create a yield-bearing ERC-4626 vault for your tokenized asset."
              actionText="List Asset in Vault"
              onAction={() => handleAction(5, () => listAsset(assets[0]))}
              isProcessing={loading}
              currentStep={currentStep}
              isComplete={currentStep > 5}
            >
              <div className="info-box bg-primary/5 border-primary/20">
                <div className="flex items-center gap-3">
                  <Package className="text-primary" />
                  <div>
                    <div className="text-sm font-bold">Target Asset: {assets[0].name}</div>
                    <div className="text-xs text-muted">Ready for Institutional Listing</div>
                  </div>
                </div>
              </div>
            </StepContainer>
          )}
        </div>

        {/* Activity Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="label-xs mb-4 flex items-center gap-2">
              <Package size={14} /> Asset Inventory
            </h3>
            <div className="space-y-3">
              {assets.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-xl">
                  <div className="text-[10px] text-muted">No assets tokenized yet</div>
                </div>
              ) : (
                assets.map(asset => (
                  <div key={asset.id} className="p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold">{asset.name}</span>
                      <span className="text-[10px] bg-primary/20 text-primary px-2 rounded-full">{asset.symbol}</span>
                    </div>
                    <div className="text-[10px] text-muted mb-2">{asset.category}</div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                      <span className="text-[10px] text-success">● {asset.status}</span>
                      <Button className="p-1 text-[10px]" onClick={() => setCurrentStep(5)}>
                        <Plus size={10} /> List
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="label-xs mb-4 flex items-center gap-2">
              <History size={14} /> Protocol Activity
            </h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {activityLogs.map(log => (
                <div key={log.id} className={`p-3 rounded-xl border ${
                  log.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' :
                  log.type === 'error' ? 'bg-red-500/5 border-red-500/20 text-red-400' :
                  'bg-slate-500/5 border-slate-500/20 text-slate-400'
                }`}>
                  <div className="flex justify-between text-[10px] mb-1 opacity-50 font-bold">
                    <span>{log.type.toUpperCase()}</span>
                    <span>{log.time}</span>
                  </div>
                  <div className="text-[11px] font-mono leading-relaxed">{log.message}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;
