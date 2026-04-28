import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileText, Activity, Users, Search, Filter, ArrowUpRight, BarChart3, Database } from 'lucide-react';
import { Card, Button } from '../components/UI';
import { fetchRegistryStats, fetchBeneficialOwners, fetchAllVaults } from '../blockchain/ethereum';
import { useWorkflow } from '../context/WorkflowContext';
import { motion } from 'framer-motion';

export const Transparency: React.FC = () => {
    const { vaults, isSyncing, walletAddress } = useWorkflow();
    const [stats, setStats] = useState({ documents: 0, pors: 0, events: 0 });
    const [selectedVault, setSelectedVault] = useState<string>('');
    const [owners, setOwners] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            const { fetchRegistryStats } = await import('../blockchain/ethereum');
            const statData = await fetchRegistryStats();
            setStats(statData);
            if (vaults.length > 0 && !selectedVault) {
                setSelectedVault(vaults[0].vaultAddress);
            }
        };
        loadInitialData();
    }, [vaults]);

    useEffect(() => {
        if (!selectedVault) return;

        const loadOwners = async () => {
            setIsLoading(true);
            const vault = vaults.find(v => v.vaultAddress === selectedVault);
            if (vault) {
                const ownerData = await fetchBeneficialOwners(vault.address, selectedVault);
                setOwners(ownerData);
            }
            setIsLoading(false);
        };
        loadOwners();
    }, [selectedVault, vaults]);

    return (
        <div className="space-y-10 animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-black text-slate-900 leading-tight">Transparency Hub</h1>
                <p className="text-slate-500">Real-time Beneficial Ownership Registry (BOR) and Proof of Reserve (PoR) metrics.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                        <FileText size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Verified Documents</div>
                        <div className="text-2xl font-black text-slate-900">{stats.documents}</div>
                    </div>
                </Card>
                <Card className="p-6 border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">PoR Attestations</div>
                        <div className="text-2xl font-black text-slate-900">{stats.pors}</div>
                    </div>
                </Card>
                <Card className="p-6 border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                        <Activity size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">On-Chain Audit Events</div>
                        <div className="text-2xl font-black text-slate-900">{stats.events}</div>
                    </div>
                </Card>
            </div>

            <Card className="overflow-hidden border-none shadow-2xl shadow-slate-100 rounded-[2.5rem]">
                <div className="p-8 bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                            <Users size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight leading-none mb-1">Beneficial Ownership Registry</h2>
                            <div className="text-[10px] font-bold uppercase tracking-widest opacity-50">Atomic Visibility into Institutional Liquidity</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                            <select 
                                value={selectedVault}
                                onChange={(e) => setSelectedVault(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                            >
                                <option value="" disabled className="text-slate-900">Select Asset Vault</option>
                                {vaults.map(v => (
                                    <option key={v.vaultAddress} value={v.vaultAddress} className="text-slate-900">
                                        {v.name} ({v.symbol})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button 
                            variant="secondary" 
                            className="bg-indigo-500 border-indigo-400 text-white hover:bg-indigo-400 font-bold text-xs"
                            onClick={async () => {
                                if (!selectedVault) return;
                                try {
                                    const { syncOwnership, checkVaultBalance } = await import('../blockchain/ethereum');
                                    
                                    if (walletAddress) {
                                        const balance = await checkVaultBalance(selectedVault, walletAddress);
                                        if (parseFloat(balance) === 0) {
                                            alert("Your balance in this vault is 0. You need to Invest (deposit) some tokens in the Marketplace first before you can be recorded in the Beneficial Owner Registry.");
                                            return;
                                        }
                                    }

                                    await syncOwnership(selectedVault);
                                    alert("Sync Successful! Your ownership is now recorded in the AssetRegistry.");
                                    // Refresh the list
                                    const vault = vaults.find(v => v.vaultAddress === selectedVault);
                                    if (vault) {
                                        const { fetchBeneficialOwners } = await import('../blockchain/ethereum');
                                        const ownerData = await fetchBeneficialOwners(vault.address, selectedVault);
                                        setOwners(ownerData);
                                    }
                                } catch (e: any) {
                                    alert("Sync Failed: " + (e.message || "Unknown error"));
                                }
                            }}
                        >
                            <Activity size={18} className="mr-2" /> Sync My Ownership
                        </Button>
                    </div>
                </div>

                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Investor Address</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Vault Shares</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">APT Claim (USD)</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Ownership %</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Last Synced</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <Loader size={32} className="animate-spin text-indigo-500" />
                                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Reading Blockchain Registry...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : owners.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-24 text-center">
                                        <div className="max-w-xs mx-auto space-y-4">
                                            <Database size={48} className="mx-auto text-slate-200" />
                                            <div className="space-y-1">
                                                <p className="text-slate-800 font-bold">No Records Found</p>
                                                <p className="text-slate-400 text-xs">Verify the selected vault has active institutional participants.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                owners.map((owner, i) => (
                                    <motion.tr 
                                        key={i} 
                                        initial={{ opacity: 0 }} 
                                        animate={{ opacity: 1 }} 
                                        transition={{ delay: i * 0.05 }}
                                        className="hover:bg-indigo-50/30 transition-colors group"
                                    >
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                                                    {i + 1}
                                                </div>
                                                <span className="font-mono text-sm text-slate-600 group-hover:text-indigo-600 transition-colors">
                                                    {owner.investor.slice(0, 8)}...{owner.investor.slice(-6)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 font-black text-slate-800">{Number(owner.shares).toLocaleString()} vAPT</td>
                                        <td className="px-8 py-6 font-black text-indigo-600">
                                            ${Number(owner.claim).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500" style={{ width: `${owner.bps / 100}%` }}></div>
                                                </div>
                                                <span className="text-xs font-black text-slate-600">{(owner.bps / 100).toFixed(2)}%</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-bold text-slate-800">{owner.updated}</span>
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                    <ShieldCheck size={10} className="text-emerald-500" /> On-Chain Validated
                                                </span>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="p-8 border-slate-100">
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                        <BarChart3 size={20} className="text-indigo-600" /> Protocol Invariants
                    </h3>
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                            <div>
                                <div className="text-[10px] font-black uppercase text-slate-400">Sum of Claims vs Vault Assets</div>
                                <div className="text-sm font-bold text-slate-800">100% Balanced</div>
                            </div>
                            <ShieldCheck className="text-emerald-500" />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                            <div>
                                <div className="text-[10px] font-black uppercase text-slate-400">Total Beneficial Owners</div>
                                <div className="text-sm font-bold text-slate-800">{owners.length} Active Participants</div>
                            </div>
                            <Users className="text-indigo-500" />
                        </div>
                    </div>
                </Card>

                <Card className="p-8 bg-indigo-600 text-white border-none relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="relative z-10 space-y-6">
                        <Database className="opacity-50" size={40} />
                        <div>
                            <h3 className="text-2xl font-bold tracking-tight mb-2">Request On-Chain Audit</h3>
                            <p className="text-indigo-100 text-sm leading-relaxed mb-6 font-medium">
                                Institutional users can request an off-chain data sync or full protocol audit report certified by the clearing house matching state.
                            </p>
                        </div>
                        <Button variant="secondary" className="w-full bg-white text-indigo-600 hover:bg-slate-50 py-4 font-black text-xs uppercase tracking-widest">
                            Download Audit Report <ArrowUpRight size={14} className="ml-2" />
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

const Loader = ({ size, className }: any) => (
    <Activity size={size} className={className} />
);
