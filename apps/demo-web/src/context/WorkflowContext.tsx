import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchAllVaults, fetchTreasuryInventory } from '../blockchain/ethereum';

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
  // Vault specific data
  symbol?: string;
  assetSymbol?: string;
  myShares?: string;
  openPosition?: string;
}

export type View = 'overview' | 'verification' | 'tokenize' | 'assets' | 'marketplace' | 'transparency' | 'settings';

interface WorkflowContextType {
  role: 'issuer' | 'investor' | null;
  setRole: (role: 'issuer' | 'investor' | null) => void;
  activeView: View;
  setActiveView: (view: View) => void;
  verificationStatus: boolean;
  setVerificationStatus: (status: boolean) => void;
  assets: Asset[];
  vaults: Asset[];
  addAsset: (asset: Asset) => void;
  listAsset: (id: string, vaultAddress: string) => void;
  walletAddress: string | null;
  connectWallet: () => void;
  isSyncing: boolean;
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

  const [isSyncing, setIsSyncing] = useState(false);

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

  // Sync Marketplace from Blockchain
  const [vaults, setVaults] = useState<Asset[]>([]);

  useEffect(() => {
    const syncMarketplace = async () => {
      setIsSyncing(true);
      try {
        const [onChainVaults, treasuryInventory] = await Promise.all([
          fetchAllVaults(walletAddress || undefined).catch(err => {
            console.error("Vault Sync Failed:", err);
            return [];
          }),
          fetchTreasuryInventory().catch(err => {
            console.error("Inventory Sync Failed:", err);
            return [];
          })
        ]);
        
        setVaults(onChainVaults);
        
        setAssets(prev => {
          // Keep local drafts (non-finalized tokenizations)
          const drafts = prev.filter(a => !a.address);
          
          // Inventory is the source of truth for assets available to be listed
          const merged: Asset[] = [...treasuryInventory];
          
          drafts.forEach(draft => {
             const alreadyExists = treasuryInventory.some((v: any) => v.id === draft.id);
             if (!alreadyExists) merged.push(draft);
          });
          
          localStorage.setItem('crats_assets', JSON.stringify(merged));
          return merged;
        });
      } catch (err) {
        console.error("Critical sync failure:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncMarketplace();
    const interval = setInterval(syncMarketplace, 15000); 
    return () => clearInterval(interval);
  }, [walletAddress]);

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
      vaults,
      addAsset,
      listAsset,
      walletAddress,
      connectWallet,
      isSyncing
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
