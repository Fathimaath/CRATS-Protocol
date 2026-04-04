import { ethers } from 'ethers';
import { 
  IDENTITY_REGISTRY_ADDR, 
  ASSET_FACTORY_ADDR, 
  VAULT_FACTORY_ADDR,
  SEPOLIA_RPC
} from '../constants';

const PRIVATE_KEY = "0x3dd6badc334972b731e5b1fe0244bfbc5bbdf5bcb45f60fc0273e1e2d48af618";

export const getProvider = () => new ethers.JsonRpcProvider(SEPOLIA_RPC);
export const getWallet = () => new ethers.Wallet(PRIVATE_KEY, getProvider());

/**
 * Onboard User (Layer 1)
 * Calls IdentityRegistry.registerIdentity which atomically:
 * 1. Registers organization data
 * 2. Mints an IdentitySBT NFT directly to the userAddress
 */
export const onboardUser = async (userAddress: string, countryCode: number = 826, roleId: number = 1) => {
  const wallet = getWallet(); // Treasury (KYC Provider)
  const registry = new ethers.Contract(
    IDENTITY_REGISTRY_ADDR,
    [
      "function registerIdentity(address primaryWallet, uint8 role, uint16 jurisdiction, bytes32 didHash, string calldata did, uint64 expiresAt) external returns (uint256)",
      "event IdentityRegistered(address indexed wallet, uint256 indexed tokenId, uint8 role, uint16 jurisdiction)"
    ],
    wallet
  );

  const did = `did:crats:sepolia:${userAddress.toLowerCase()}`;
  const didHash = ethers.id(did);
  const expiresAt = Math.floor(Date.now() / 1000) + (2 * 365 * 24 * 60 * 60); // 2 years

  const tx = await registry.registerIdentity(
    userAddress, 
    roleId, 
    countryCode, 
    didHash, 
    did, 
    expiresAt,
    { gasLimit: 1000000 }
  );

  await tx.wait();
  return tx.hash;
};

// Deprecated: Registry.registerIdentity now handles minting
export const executeStep1 = onboardUser; 
export const executeStep3 = async () => ""; // No-op for backward compatibility

// Layer 2: Asset Tokenization (Unified)
export const executeTokenizationFlow = async (name: string, symbol: string, supply: string, nav: string) => {
  const wallet = getWallet();
  const factory = new ethers.Contract(
    ASSET_FACTORY_ADDR,
    [
      "function deployAsset(string name, string symbol, uint256 initialSupply, bytes32 category) public returns (address)",
      "event AssetDeployed(address indexed token, address indexed issuer, bytes32 category)"
    ],
    wallet
  );

  // 1. Deploy Asset
  const tx = await factory.deployAsset(name, symbol, ethers.parseUnits(supply, 18), ethers.id("REAL_ESTATE"), { gasLimit: 3000000 });
  const receipt = await tx.wait();
  
  if (!receipt) throw new Error("Transaction failed: No receipt");

  // Parse AssetDeployed event
  const iface = new ethers.Interface(["event AssetDeployed(address indexed token, address indexed issuer, bytes32 category)"]);
  const eventFragment = iface.getEvent("AssetDeployed");
  
  const log = receipt.logs.find((l: any) => l.topics[0] === eventFragment?.topicHash);
  if (!log) throw new Error("AssetDeployed event not found in transaction logs");

  const parsedLog = iface.parseLog(log);
  if (!parsedLog) throw new Error("Failed to parse AssetDeployed log");
  
  const assetAddress = parsedLog.args.token;

  // 2. Set NAV
  const assetContract = new ethers.Contract(
    assetAddress,
    ["function setNAV(uint256 newNAV) public"],
    wallet
  );

  const txNav = await assetContract.setNAV(ethers.parseUnits(nav, 18), { gasLimit: 200000 });
  await txNav.wait();

  return { assetAddress, txHash: tx.hash };
};

// Layer 3: Vault Listing
export const createVaultForAsset = async (assetAddress: string) => {
  const wallet = getWallet();
  const factory = new ethers.Contract(
    VAULT_FACTORY_ADDR,
    [
      "function createSyncVault(address assetToken, string name, string symbol, bytes32 category) public returns (address)",
      "event VaultCreated(address indexed vault, address indexed asset, bytes32 indexed category, uint8 vaultType, address creator, uint256 createdAt)"
    ],
    wallet
  );
  
  const tx = await factory.createSyncVault(assetAddress, "Nexus Vault", "vNXS", ethers.id("REAL_ESTATE"), { gasLimit: 3000000 });
  const receipt = await tx.wait();
  
  if (!receipt) throw new Error("Vault creation failed: No receipt");

  // Parse VaultCreated event
  const iface = new ethers.Interface(["event VaultCreated(address indexed vault, address indexed asset, bytes32 indexed category, uint8 vaultType, address creator, uint256 createdAt)"]);
  const eventFragment = iface.getEvent("VaultCreated");
  
  const log = receipt.logs.find((l: any) => l.topics[0] === eventFragment?.topicHash);
  if (!log) throw new Error("VaultCreated event not found in transaction logs");

  const parsedLog = iface.parseLog(log);
  if (!parsedLog) throw new Error("Failed to parse VaultCreated log");

  const vaultAddress = parsedLog.args.vault;
  
  return vaultAddress;
};

// Layer 3: Marketplace Investment
export const investInVault = async (vaultAddress: string, amount: string) => {
  const wallet = getWallet();
  const vault = new ethers.Contract(
    vaultAddress,
    ["function deposit(uint256 assets, address receiver) public returns (uint256)"],
    wallet
  );
  
  const tx = await vault.deposit(ethers.parseUnits(amount, 18), wallet.address, { gasLimit: 500000 });
  await tx.wait();
  return tx.hash;
};
