import { ethers } from 'ethers';
import { 
  IDENTITY_REGISTRY_ADDR, 
  ASSET_FACTORY_ADDR,
  VAULT_FACTORY_ADDR,
  ASSET_REGISTRY_ADDR,
  SEPOLIA_RPC,
  USDT_ADDR,
} from '../constants';

const ASSET_IMAGES: Record<string, string[]> = {
  'REAL_ESTATE': [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?q=80&w=800&auto=format&fit=crop'
  ],
  'FINE_ART': [
    'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1576775104585-70335006ccf3?q=80&w=800&auto=format&fit=crop'
  ],
  'CARBON_CREDIT': [
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1473081556163-2a1713ff9724?q=80&w=800&auto=format&fit=crop'
  ],
  'PRIVATE_EQUITY': [
    'https://images.unsplash.com/photo-1551836022-d5d8b5c7190b?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1507679799987-c73774873b95?q=80&w=800&auto=format&fit=crop'
  ],
  'DEFAULT': [
    'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=800&auto=format&fit=crop'
  ]
};

const getRandomImage = (category: string, id: string) => {
  const cat = category.toUpperCase().replace(/\s+/g, '_');
  const imgs = ASSET_IMAGES[cat] || ASSET_IMAGES['DEFAULT'];
  // Deterministic random based on ID
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return imgs[hash % imgs.length];
};

const PRIVATE_KEY = "0x3dd6badc334972b731e5b1fe0244bfbc5bbdf5bcb45f60fc0273e1e2d48af618";

export const getProvider = () => new ethers.JsonRpcProvider(SEPOLIA_RPC);
export const getWallet = () => new ethers.Wallet(PRIVATE_KEY, getProvider());

export const getMetaMaskSigner = async () => {
  if (!(window as any).ethereum) throw new Error("MetaMask not found. Please install the extension.");
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  return await provider.getSigner();
};

/**
 * Check USDT balance for the investor
 */
export const checkUSDTBalance = async (userAddress: string) => {
  const provider = getProvider();
  const usdt = new ethers.Contract(
    USDT_ADDR,
    ["function balance(address) public view returns (uint256)", "function balanceOf(address) public view returns (uint256)"],
    provider
  );
  
  try {
    // Try both standard naming conventions
    const balance = await usdt.balanceOf(userAddress).catch(() => usdt.balance(userAddress));
    return ethers.formatUnits(balance, 18);
  } catch (e) {
    console.warn("Could not fetch USDT balance:", e);
    return "0.0";
  }
};

/**
 * Mint Mock USDT for testing (Faucet)
 */
export const mintMockUSDT = async (userAddress: string) => {
  const signer = await getMetaMaskSigner();
  const usdt = new ethers.Contract(
    USDT_ADDR,
    ["function mint(address to, uint256 amount) external"],
    signer
  );
  
  const tx = await usdt.mint(userAddress, ethers.parseUnits("1000", 18));
  await tx.wait();
  return tx.hash;
};

/**
 * Universal Identity Guard: Ensures an address is verified in the protocol registry.
 * If the Institutional Treasury is the provider, it will self-authorize if needed.
 */
export const ensureAddressVerified = async (targetAddress: string, role: number = 3, name: string = "System Component", onStatusUpdate?: (status: string) => void) => {
  const wallet = getWallet();
  console.log(`[Compliance] Checking ${name} (${targetAddress})...`);
  
  const registryIface = new ethers.Interface([
    "function isVerified(address) external view returns (bool)",
    "function identitySBT() external view returns (address)",
    "function registerIdentity(address primaryWallet, uint8 role, uint16 jurisdiction, bytes32 didHash, string did, uint64 expiresAt) external returns (uint256)",
    "function updateStatus(address wallet, uint8 newStatus) external",
    "function hasRole(bytes32 role, address account) external view returns (bool)"
  ]);

  const registry = new ethers.Contract(IDENTITY_REGISTRY_ADDR, registryIface, wallet);

  // 1. Check if Identity exists or is verified
  try {
    const isVerified = await registry.isVerified(targetAddress);
    if (isVerified) {
       console.log(`[Compliance] ${name} is already verified.`);
       return;
    }

    const sbtAddr = await registry.identitySBT();
    const sbt = new ethers.Contract(sbtAddr, ["function tokenIdOf(address) external view returns (uint256)"], wallet);
    const existingTokenId = await sbt.tokenIdOf(targetAddress);

    if (existingTokenId > 0n) {
      if (onStatusUpdate) onStatusUpdate(`Updating Compliance Status for ${name}...`);
      console.log(`[Compliance] ${name} has token ${existingTokenId}, updating status to VERIFIED...`);
      const registryManager = new ethers.Contract(IDENTITY_REGISTRY_ADDR, ["function updateStatus(address wallet, uint8 newStatus) external"], wallet);
      const tx = await registryManager.updateStatus(targetAddress, 2, { gasLimit: 500000 });
      await tx.wait();
    } else {
      if (onStatusUpdate) onStatusUpdate(`Registering ${name} in Compliance Registry...`);
      const did = `did:crats:sepolia:${targetAddress.toLowerCase()}`;
      const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60); // 10 years
      const didHash = ethers.id(did);
      
      console.log(`[Compliance] Encoding registerIdentity for ${targetAddress}`);
      const tx = await registry.registerIdentity(
        targetAddress, 
        role, 
        826, 
        didHash, 
        did, 
        expiresAt, 
        { gasLimit: 1200000 }
      );
      console.log(`[Compliance] Transaction sent: ${tx.hash}`);
      await tx.wait();
    }
    if (onStatusUpdate) onStatusUpdate(`${name} Verified.`);
  } catch (err: any) {
    console.error(`[Compliance Error] Failed for ${name}:`, err);
    throw new Error(`Compliance Verification Failed for ${name}: ${err.reason || err.message}`);
  }
};

/**
 * Ensure the Institutional Treasury is verified (Backward compatibility)
 */
export const ensureTreasuryVerified = async (onStatusUpdate?: (status: string) => void) => {
  const wallet = getWallet();
  return ensureAddressVerified(wallet.address, 2, "Institutional Treasury", onStatusUpdate);
};

/**
 * Onboard User (Layer 1)
 * Calls IdentityRegistry.registerIdentity which atomically:
 * 1. Registers organization data
 * 2. Mints an IdentitySBT NFT directly to the userAddress
 */
export const onboardUser = async (userAddress: string, countryCode: number = 826, roleId: number = 1) => {
  const wallet = getWallet(); // Treasury (KYC Provider)
  const registryABI = [
    "function registerIdentity(address primaryWallet, uint8 role, uint16 jurisdiction, bytes32 didHash, string calldata did, uint64 expiresAt) external returns (uint256)",
    "function isVerified(address wallet) external view returns (bool)",
    "event IdentityRegistered(address indexed wallet, uint256 indexed tokenId, uint8 role, uint16 jurisdiction)"
  ];

  const registry = new ethers.Contract(
    IDENTITY_REGISTRY_ADDR,
    registryABI,
    wallet
  );

  const did = `did:crats:sepolia:${userAddress.toLowerCase()}`;
  const didHash = ethers.id(did);
  const expiresAt = Math.floor(Date.now() / 1000) + (2 * 365 * 24 * 60 * 60); // 2 years

  // 1. Check if Treasury itself is verified. If not, verify it first.
  const treasuryAddress = wallet.address;
  const isTreasuryVerified = await registry.isVerified(treasuryAddress);
  console.log(`[Onboarding] Treasury: ${treasuryAddress} | Verified: ${isTreasuryVerified}`);
  
  if (!isTreasuryVerified) {
    // Safety check: Does it have an identity already?
    const sbtAddr = await registry.identitySBT();
    const sbt = new ethers.Contract(sbtAddr, ["function tokenIdOf(address) view returns (uint256)"], wallet);
    const treasuryTokenId = await sbt.tokenIdOf(treasuryAddress);
    
    if (treasuryTokenId > 0n) {
      console.log(`[Onboarding] Treasury has identity ${treasuryTokenId} but is not verified. Updating status...`);
      const registryManager = new ethers.Contract(IDENTITY_REGISTRY_ADDR, [
        "function updateStatus(address wallet, uint8 newStatus) external"
      ], wallet);
      const txS = await registryManager.updateStatus(treasuryAddress, 2, { gasLimit: 500000 });
      await txS.wait();
    } else {
      console.log("Onboarding Treasury...");
      const treasuryDid = `did:crats:sepolia:${treasuryAddress.toLowerCase()}`;
      const treasuryDidHash = ethers.id(treasuryDid);
      const txT = await registry.registerIdentity(
        treasuryAddress, 
        2, // Role 2 for Provider/Admin
        countryCode, 
        treasuryDidHash, 
        treasuryDid, 
        expiresAt,
        { gasLimit: 1000000 }
      );
      await txT.wait();
    }
  }

  // 2. Onboard the requested user
  const isUserVerified = await registry.isVerified(userAddress);
  if (isUserVerified) {
    console.log(`[Onboarding] User ${userAddress} is already verified.`);
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // Final Safety Check: Does user have an identity already?
  const sbtAddr = await registry.identitySBT();
  const sbt = new ethers.Contract(sbtAddr, ["function tokenIdOf(address) view returns (uint256)"], wallet);
  const userTokenId = await sbt.tokenIdOf(userAddress);

  if (userTokenId > 0n) {
    console.log(`[Onboarding] User has identity ${userTokenId} but is not verified. Updating status...`);
    const registryManager = new ethers.Contract(IDENTITY_REGISTRY_ADDR, [
      "function updateStatus(address wallet, uint8 newStatus) external"
    ], wallet);
    const txU = await registryManager.updateStatus(userAddress, 2, { gasLimit: 500000 });
    await txU.wait();
    return txU.hash;
  }

  console.log(`[Onboarding] Registering User: ${userAddress}`);
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
export const executeTokenizationFlow = async (name: string, symbol: string, supply: string, nav: string, category: string = "REAL_ESTATE") => {
  const wallet = getWallet();
  const categoryId = ethers.id(category.toUpperCase().replace(/\s+/g, '_'));
  
  // Ensure Treasury is verified before deployment (required for initial mint)
  await ensureTreasuryVerified();

  const factory = new ethers.Contract(
    ASSET_FACTORY_ADDR,
    [
      "function deployAsset(string name, string symbol, uint256 initialSupply, bytes32 category) public returns (address)",
      "function isIssuerApproved(address issuer) external view returns (bool)",
      "function approveIssuer(address issuer) external",
      "event AssetDeployed(address indexed token, address indexed issuer, bytes32 category)"
    ],
    wallet
  );

  // 0. Auto-Approve Treasury as Issuer if needed
  const isApproved = await factory.isIssuerApproved(wallet.address).catch(() => false);
  if (!isApproved) {
    console.log(`[Tokenization] Approving Treasury ${wallet.address} as Issuer...`);
    const approveTx = await factory.approveIssuer(wallet.address, { gasLimit: 100000 });
    await approveTx.wait();
    console.log("[Tokenization] Treasury approved.");
  }

  // 1. Deploy Asset
  const tx = await factory.deployAsset(name, symbol, ethers.parseUnits(supply, 18), categoryId, { gasLimit: 3000000 });
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

  // 2. Automate Asset Verification (NEW: Zero-Touch Compliance)
  await ensureAddressVerified(assetAddress, 3, "New Asset Protocol", (s) => console.log(s));

  // 3. Set NAV
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
export const createVaultForAsset = async (assetAddress: string, name: string, symbol: string, category: string = "REAL_ESTATE") => {
  const wallet = getWallet();
  const categoryId = ethers.id(category.toUpperCase().replace(/\s+/g, '_'));
  
  const factory = new ethers.Contract(
    VAULT_FACTORY_ADDR,
    [
      "function createSyncVault(address assetToken, string name, string symbol, bytes32 category) public returns (address)",
      "event VaultCreated(address indexed vault, address indexed asset, bytes32 indexed category, uint8 vaultType, address creator, uint256 createdAt)"
    ],
    wallet
  );
  
  const vaultName = `${name} Vault`;
  const vaultSymbol = `v${symbol.toUpperCase()}`;
  
  const tx = await factory.createSyncVault(
    assetAddress, 
    vaultName, 
    vaultSymbol, 
    categoryId, 
    { gasLimit: 3000000 }
  );
  
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Vault creation failed: No receipt");

  const iface = new ethers.Interface(["event VaultCreated(address indexed vault, address indexed asset, bytes32 indexed category, uint8 vaultType, address creator, uint256 createdAt)"]);
  const log = receipt.logs.find((l: any) => l.topics[0] === iface.getEvent("VaultCreated")?.topicHash);
  if (!log) throw new Error("VaultCreated event not found");

  const parsedLog = iface.parseLog(log);
  const vaultAddress = parsedLog!.args.vault;
  
  // Automate Vault Verification
  await ensureAddressVerified(vaultAddress, 3, "New Institutional Vault", (s) => console.log(s));
  
  return vaultAddress;
};

// Marketplace: Sync Marketplace from Blockchain
export const fetchAllVaults = async (userAddress?: string) => {
  const provider = getProvider();
  const factory = new ethers.Contract(
    VAULT_FACTORY_ADDR,
    [
      "function getAllVaults() external view returns (address[])",
      "function getVaultInfo(address vault) external view returns (tuple(address vault, address asset, bytes32 category, uint8 vaultType, address creator, uint256 createdAt, bool active, string name, string symbol))"
    ],
    provider
  );

  const vaultAddresses: string[] = await factory.getAllVaults();
  const vaults = [];

  for (const addr of vaultAddresses) {
    try {
      const info = await factory.getVaultInfo(addr);
      const vault = new ethers.Contract(
        addr,
        [
          "function totalSupply() external view returns (uint256)",
          "function balanceOf(address) external view returns (uint256)",
          "function asset() external view returns (address)"
        ],
        provider
      );

      const token = new ethers.Contract(
        info.asset,
        [
          "function symbol() external view returns (string)",
          "function currentNAV() external view returns (uint256)"
        ],
        provider
      );

      const [totalSupply, userBalance, nav, assetSymbol] = await Promise.all([
        vault.totalSupply(),
        userAddress ? vault.balanceOf(userAddress) : 0n,
        token.currentNAV().catch(() => ethers.parseUnits("1", 18)),
        token.symbol().catch(() => "RWA")
      ]);

      const navNum = parseFloat(ethers.formatUnits(nav, 18));
      const balanceNum = parseFloat(ethers.formatUnits(userBalance, 18));

      vaults.push({
        id: addr,
        name: info.name,
        symbol: info.symbol,
        assetSymbol: assetSymbol,
        supply: ethers.formatUnits(totalSupply, 18),
        myShares: ethers.formatUnits(userBalance, 18),
        openPosition: (balanceNum * navNum).toFixed(2),
        nav: navNum.toFixed(2),
        price: "1.00",
        image: getRandomImage(info.category, addr),
        address: info.asset,
        vaultAddress: addr,
        category: info.category,
        isListed: true
      });
    } catch (err) {
      console.error(`Failed to fetch info for vault ${addr}:`, err);
    }
  }
  return vaults;
};

/**
 * Fetch assets where Treasury has balance (Institutional Inventory)
 */
export const fetchTreasuryInventory = async () => {
   const provider = getProvider();
   const factory = new ethers.Contract(
     ASSET_FACTORY_ADDR,
     [
        "function allAssets(uint256 index) external view returns (address)",
        "function assetCount() external view returns (uint256)",
        "function assets(address token) external view returns (address token, address issuer, bytes32 category, uint256 timestamp)"
     ],
     provider
   );
 
   const treasuryAddress = getWallet().address;
   const count = await factory.assetCount().catch(() => 0n);
      const inventory = [];
    console.log(`[Inventory Sync] Searching through ${count} assets in factory...`);
    
    for (let i = 0; i < Number(count); i++) {
      const addr = await factory.allAssets(i).catch(() => null);
      if (!addr) continue;
 
      const info = await factory.assets(addr).catch(() => null);
      if (!info) continue;

      // info[1] is the issuer address based on AssetInfo struct in AssetFactory.sol
      const issuer = (info.issuer || info[1])?.toLowerCase();
      console.log(`[Inventory Sync] Asset ${i}: ${addr} | Issuer: ${issuer}`);

      if (issuer !== treasuryAddress.toLowerCase()) continue;
 
     const token = new ethers.Contract(
       addr,
       ["function name() view returns (string)", "function symbol() view returns (string)", "function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function currentNAV() view returns (uint256)"],
       provider
     );
 
     try {
       const [name, symbol, supply, balance, nav] = await Promise.all([
         token.name(),
         token.symbol(),
         token.totalSupply(),
         token.balanceOf(treasuryAddress),
         token.currentNAV().catch(() => 0n)
       ]);
 
       if (balance > 0n) {
         inventory.push({
           id: symbol,
           name: name,
           category: info.category,
           supply: ethers.formatUnits(supply, 18),
           balance: ethers.formatUnits(balance, 18),
           nav: `$${parseFloat(ethers.formatUnits(nav, 18)).toLocaleString()}`,
           price: "$1.00",
           image: getRandomImage(info.category, symbol),
           address: addr,
           isListed: false
         });
       }
     } catch (e) {
       console.warn(`Failed to fetch details for asset ${addr}:`, e);
     }
   }
   return inventory;
 };

// Layer 3: Marketplace Investment
export const investInVault = async (
  vaultAddress: string, 
  amount: string, 
  receiverAddress: string,
  onStatusUpdate?: (status: string) => void
) => {
  const treasuryWallet = getWallet();
  const investorSigner = await getMetaMaskSigner();
  
  // 0. Pre-flight Balance Check
  if (onStatusUpdate) onStatusUpdate("Verifying USDT Balance...");
  const balance = await checkUSDTBalance(receiverAddress);
  if (parseFloat(balance) < parseFloat(amount)) {
    throw new Error(`Insufficient USDT Balance. You have ${balance} USDT but need ${amount} USDT. Please use a Sepolia Faucet.`);
  }

  // --- STAGE 1: MetaMask Transfer (USDT from Investor -> Treasury) ---
  if (onStatusUpdate) onStatusUpdate("Awaiting USDT Transfer Approval...");
  
  // Robust ABI for USDT
  const ERC20_ABI = [
    "function transfer(address to, uint256 value) public returns (bool)",
    "function decimals() public view returns (uint8)"
  ];
  const usdt = new ethers.Contract(USDT_ADDR, ERC20_ABI, investorSigner);

  try {
    const txTransfer = await usdt.transfer(treasuryWallet.address, ethers.parseUnits(amount, 18), { 
      gasLimit: 120000,
    });
    
    if (onStatusUpdate) onStatusUpdate("Confirming USDT Transfer on Sepolia...");
    await txTransfer.wait();
  } catch (err: any) {
    console.error("USDT Transfer Failed:", err);
    throw new Error(err.reason || err.message || "MetaMask transaction failed. Check your balance and Sepolia connection.");
  }

  // --- STAGE 2: Automated Investor Verification ---
  if (onStatusUpdate) onStatusUpdate("Verifying Investor Compliance...");
  await ensureAddressVerified(investorSigner.address, 4, "Investor", onStatusUpdate);

  // --- STAGE 3: Institutional Conversion (Treasury Mediation) ---
  if (onStatusUpdate) onStatusUpdate("Preparing Institutional Settlements...");
  await ensureAddressVerified(treasuryWallet.address, 2, "Institutional Treasury", onStatusUpdate);
  await ensureAddressVerified(vaultAddress, 3, "Institutional Vault", onStatusUpdate);

  if (onStatusUpdate) onStatusUpdate("2/3: Institutional Settlement in Progress...");
  
  const vault = new ethers.Contract(
    vaultAddress,
    ["function asset() external view returns (address)"],
    treasuryWallet
  );

  const assetAddress = await vault.asset();
  
  // 1. Check Treasury's Asset Balance (Safety Check)
  const assetInterface = new ethers.Interface([
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)"
  ]);
  const assetContract = new ethers.Contract(assetAddress, assetInterface, treasuryWallet);
  const treasuryAssetBalance = await assetContract.balanceOf(treasuryWallet.address);
  
  console.log(`[Stage 2] Target Asset: ${assetAddress}`);
  console.log(`[Stage 2] Treasury Asset Balance: ${ethers.formatUnits(treasuryAssetBalance, 18)}`);

  if (treasuryAssetBalance < ethers.parseUnits(amount, 18)) {
    throw new Error(`Treasury Settlement Error: Insufficient AssetTokens in Treasury. The Issuer may need to tokenize more assets first.`);
  }

  const approveData = assetInterface.encodeFunctionData("approve", [vaultAddress, ethers.parseUnits(amount, 18)]);
  
  console.log(`[Stage 2] Approve Data: ${approveData}`);

  const txApprove = await treasuryWallet.sendTransaction({
    to: assetAddress,
    data: approveData,
    gasLimit: 250000
  });

  if (onStatusUpdate) onStatusUpdate("Settling Institutional Asset Allocation...");
  await txApprove.wait();

  // --- STAGE 3: Vault Share Minting (Atomic Settlement) ---
  if (onStatusUpdate) onStatusUpdate(`3/3: Minting Vault Shares to Connected Wallet...`);

  const vaultInterface = new ethers.Interface(["function deposit(uint256 assets, address receiver) external returns (uint256)"]);
  const depositData = vaultInterface.encodeFunctionData("deposit", [ethers.parseUnits(amount, 18), receiverAddress]);

  console.log(`[Stage 3] Deposit Target (Vault): ${vaultAddress}`);
  console.log(`[Stage 3] Recipient: ${receiverAddress}`);
  console.log(`[Stage 3] Deposit Data: ${depositData}`);

  const txDeposit = await treasuryWallet.sendTransaction({
    to: vaultAddress,
    data: depositData,
    gasLimit: 1000000
  });

  if (onStatusUpdate) onStatusUpdate("Finalizing Atomic Share Issuance...");
  await txDeposit.wait();
  
  return txDeposit.hash;
};

/**
 * Fetch Global Registry Metrics (Layer 2 & 3 transparency)
 */
export const fetchRegistryStats = async () => {
  try {
    const provider = getProvider();
    const registry = new ethers.Contract(
      ASSET_REGISTRY_ADDR,
      [
        "function documentCount() external view returns (uint256)",
        "function porCount() external view returns (uint256)",
        "function eventCount() external view returns (uint256)"
      ],
      provider
    );

    const [docs, pors, events] = await Promise.all([
      registry.documentCount().catch(() => 0n),
      registry.porCount().catch(() => 0n),
      registry.eventCount().catch(() => 0n)
    ]);

    return {
      documents: Number(docs),
      pors: Number(pors),
      events: Number(events)
    };
  } catch (error) {
    console.error("[Registry Stats] Missing or invalid AssetRegistry address:", ASSET_REGISTRY_ADDR);
    return { documents: 0, pors: 0, events: 0 };
  }
};

/**
 * Fetch Beneficial Owners for a specific asset/vault combination
 */
export const fetchBeneficialOwners = async (assetAddress: string, vaultAddress: string) => {
  try {
    const provider = getProvider();
    const registry = new ethers.Contract(
      ASSET_REGISTRY_ADDR,
      [
        "function getVaultOwners(address assetToken, address vault) external view returns (tuple(address investor, uint256 vaultShares, uint256 aptClaim, uint256 bpsOwnership, uint256 lastUpdated, bool isActive)[])"
      ],
      provider
    );

    const owners = await registry.getVaultOwners(assetAddress, vaultAddress).catch(() => []);
    if (!owners || owners.length === 0) return [];

    return owners.map((o: any) => ({
      investor: o.investor,
      shares: ethers.formatUnits(o.vaultShares, 18),
      claim: ethers.formatUnits(o.aptClaim, 18),
      bps: Number(o.bpsOwnership),
      updated: new Date(Number(o.lastUpdated) * 1000).toLocaleString(),
      active: o.isActive
    }));
  } catch (error) {
    console.error("[Beneficial Owners] Failed to fetch:", error);
    return [];
  }
};
/**
 * Trigger a manual BOR sync for an investor (useful for balances held before the BOR update)
 * Performed by sending a 0-value transfer to self.
 */
export const syncOwnership = async (vaultAddress: string) => {
  const signer = await getMetaMaskSigner();
  const vault = new ethers.Contract(
    vaultAddress,
    ["function transfer(address to, uint256 value) public returns (bool)"],
    signer
  );
  
  const userAddress = await signer.getAddress();
  const tx = await vault.transfer(userAddress, 0);
  await tx.wait();
  return tx.hash;
};

/**
 * Check a user's share balance in a specific vault
 */
export const checkVaultBalance = async (vaultAddress: string, userAddress: string) => {
  const provider = getProvider();
  const vault = new ethers.Contract(
    vaultAddress,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const balance = await vault.balanceOf(userAddress);
  return ethers.formatUnits(balance, 18);
};
