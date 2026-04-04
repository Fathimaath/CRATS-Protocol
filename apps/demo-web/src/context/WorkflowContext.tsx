import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Asset {
  id: string;
  name: string;
  category: string;
  supply: string;
  nav: string;
  price: string;
  image: string;
  address?: string;
  txHash?: string;
  isListed?: boolean;
  vaultAddress?: string;
}

export type View = 'overview' | 'verification' | 'tokenize' | 'assets' | 'marketplace' | 'settings';

interface WorkflowContextType {
  role: 'issuer' | 'investor' | null;
  setRole: (role: 'issuer' | 'investor' | null) => void;
  activeView: View;
  setActiveView: (view: View) => void;
  verificationStatus: boolean;
  setVerificationStatus: (status: boolean) => void;
  assets: Asset[];
  addAsset: (asset: Asset) => void;
  listAsset: (id: string, vaultAddress: string) => void;
  walletAddress: string | null;
  connectWallet: () => void;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export const WorkflowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRoleState] = useState<'issuer' | 'investor' | null>(() => {
    return localStorage.getItem('crats_role') as any;
  });
  
  const [activeView, setActiveView] = useState<View>('overview');

  const [verificationStatus, setVerificationStatusState] = useState<boolean>(() => {
    return localStorage.getItem('crats_verified') === 'true';
  });

  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = localStorage.getItem('crats_assets');
    return saved ? JSON.parse(saved) : [];
  });

  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    return localStorage.getItem('crats_wallet');
  });

  useEffect(() => {
    if ((window as any).ethereum) {
      const handleAccounts = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          localStorage.setItem('crats_wallet', accounts[0]);
        } else {
          setWalletAddress(null);
          localStorage.removeItem('crats_wallet');
        }
      };
      (window as any).ethereum.on('accountsChanged', handleAccounts);
      return () => (window as any).ethereum.removeListener('accountsChanged', handleAccounts);
    }
  }, []);

  const setRole = (newRole: 'issuer' | 'investor' | null) => {
    setRoleState(newRole);
    if (newRole) localStorage.setItem('crats_role', newRole);
    else localStorage.removeItem('crats_role');
  };

  const setVerificationStatus = (status: boolean) => {
    setVerificationStatusState(status);
    localStorage.setItem('crats_verified', String(status));
  };

  const connectWallet = async () => {
    if ((window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        setWalletAddress(accounts[0]);
        localStorage.setItem('crats_wallet', accounts[0]);
      } catch (err) {
        console.error("Metamask connection failed:", err);
      }
    } else {
      alert("Metamask extension not found. Please install it to continue.");
    }
  };

  const addAsset = (asset: Asset) => {
    const newAssets = [...assets, asset];
    setAssets(newAssets);
    localStorage.setItem('crats_assets', JSON.stringify(newAssets));
  };

  const listAsset = (id: string, vaultAddress: string) => {
    const updated = assets.map(a => a.id === id ? { ...a, isListed: true, vaultAddress } : a);
    setAssets(updated);
    localStorage.setItem('crats_assets', JSON.stringify(updated));
  };

  return (
    <WorkflowContext.Provider value={{ 
      role, 
      setRole,
      activeView,
      setActiveView,
      verificationStatus, 
      setVerificationStatus,
      assets,
      addAsset,
      listAsset,
      walletAddress,
      connectWallet
    }}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (!context) throw new Error('useWorkflow must be used within WorkflowProvider');
  return context;
};
