const { ethers } = require("hardhat");
const { upgrades } = require("hardhat");

/**
 * @dev Deploy an upgradeable contract using OpenZeppelin upgrades plugin
 */
async function deployUpgradeable(contractName, initializeArgs = []) {
  // Handle fully qualified contract names (path:ContractName)
  let ContractFactory;
  if (contractName.includes(':')) {
    ContractFactory = await ethers.getContractFactory(contractName);
  } else {
    ContractFactory = await ethers.getContractFactory(contractName);
  }
  const contract = await upgrades.deployProxy(ContractFactory, initializeArgs, {
    kind: "uups",
  });
  await contract.waitForDeployment();
  return contract;
}

/**
 * @dev Deploy an upgradeable contract with fully qualified name
 */
async function deployUpgradeableFQ(contractPath, contractName, initializeArgs = []) {
  const ContractFactory = await ethers.getContractFactory(contractPath + ":" + contractName);
  const contract = await upgrades.deployProxy(ContractFactory, initializeArgs, {
    kind: "uups",
  });
  await contract.waitForDeployment();
  return contract;
}

/**
 * @dev Test fixtures and helper functions for CRATS Protocol tests
 */

// Default test addresses
const DEFAULT_ADDRESSES = {
  admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  user1: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  user2: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  user3: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  regulator: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  compliance: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  kycProvider: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
};

// Default test values
const DEFAULT_VALUES = {
  initialSupply: ethers.parseEther("1000000"),
  mintAmount: ethers.parseEther("1000"),
  transferAmount: ethers.parseEther("100"),
  jurisdictionUS: 840,
  jurisdictionUK: 826,
  roleInvestor: 1,
  roleQualified: 2,
  roleInstitutional: 3,
  statusVerified: 2,
  statusSuspended: 3,
  statusRevoked: 4,
  kycExpiry: Math.floor(Date.now() / 1000) + 63072000, // 2 years
};

/**
 * @dev Deploy all Layer 1 contracts (without proxies for unit testing)
 * Note: For production, use upgradeable proxies via OpenZeppelin upgrades plugin
 */
async function deployLayer1Fixtures() {
  const [admin, user1, user2, regulator, compliance, kycProvider] = await ethers.getSigners();

  // Deploy KYCProvidersRegistry
  const KYCProvidersRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
  const kycRegistry = await KYCProvidersRegistry.deploy();
  await kycRegistry.waitForDeployment();
  // Note: initialize will be called by individual tests as needed

  // Deploy IdentitySBT
  const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
  const identitySBT = await IdentitySBT.deploy();
  await identitySBT.waitForDeployment();
  // Note: initialize will be called by individual tests as needed

  return {
    admin,
    user1,
    user2,
    regulator,
    compliance,
    kycProvider,
    kycRegistry,
    identitySBT,
  };
}

/**
 * @dev Deploy and initialize all Layer 1 contracts for integration testing
 */
async function deployAndInitializeLayer1() {
  const [admin, user1, user2, regulator, compliance, kycProvider] = await ethers.getSigners();

  // Deploy KYCProvidersRegistry
  const KYCProvidersRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
  const kycRegistry = await KYCProvidersRegistry.deploy();
  await kycRegistry.waitForDeployment();
  await kycRegistry.initialize(await admin.getAddress());

  // Deploy IdentitySBT
  const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
  const identitySBT = await IdentitySBT.deploy();
  await identitySBT.waitForDeployment();
  await identitySBT.initialize("CRATS Identity", "CRATSID", await admin.getAddress());

  // Deploy IdentityRegistry
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  await identityRegistry.initialize(
    await admin.getAddress(),
    await identitySBT.getAddress(),
    await kycRegistry.getAddress()
  );

  // Deploy Compliance
  const Compliance = await ethers.getContractFactory("Compliance");
  const complianceModule = await Compliance.deploy();
  await complianceModule.waitForDeployment();
  await complianceModule.initialize(await admin.getAddress(), await identityRegistry.getAddress());

  // Deploy CircuitBreakerModule
  const CircuitBreakerModule = await ethers.getContractFactory("CircuitBreakerModule");
  const circuitBreaker = await CircuitBreakerModule.deploy();
  await circuitBreaker.waitForDeployment();
  await circuitBreaker.initialize(await admin.getAddress());

  // Deploy TravelRuleModule
  const TravelRuleModule = await ethers.getContractFactory("TravelRuleModule");
  const travelRuleModule = await TravelRuleModule.deploy();
  await travelRuleModule.waitForDeployment();
  await travelRuleModule.initialize(await admin.getAddress(), await identityRegistry.getAddress());

  // Deploy InvestorRightsRegistry
  const InvestorRightsRegistry = await ethers.getContractFactory("InvestorRightsRegistry");
  const investorRightsRegistry = await InvestorRightsRegistry.deploy();
  await investorRightsRegistry.waitForDeployment();
  await investorRightsRegistry.initialize(await admin.getAddress(), await identityRegistry.getAddress());

  // Setup roles
  const COMPLIANCE_ROLE = await complianceModule.COMPLIANCE_ROLE();
  const REGULATOR_ROLE = await complianceModule.REGULATOR_ROLE();
  const KYC_PROVIDER_ROLE = await complianceModule.KYC_PROVIDER_ROLE();

  await complianceModule.grantRole(COMPLIANCE_ROLE, await compliance.getAddress());
  await complianceModule.grantRole(REGULATOR_ROLE, await regulator.getAddress());
  await complianceModule.grantRole(KYC_PROVIDER_ROLE, await kycProvider.getAddress());

  // Configure IdentitySBT roles
  const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
  await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, await kycProvider.getAddress());

  return {
    admin,
    user1,
    user2,
    regulator,
    compliance,
    kycProvider,
    kycRegistry,
    identitySBT,
    identityRegistry,
    complianceModule,
    circuitBreaker,
    travelRuleModule,
    investorRightsRegistry,
  };
}

/**
 * @dev Deploy Layer 2 Asset contracts
 */
async function deployLayer2Fixtures(layer1Contracts) {
  const { admin, identityRegistry, complianceModule, circuitBreaker } = layer1Contracts;

  // Deploy AssetToken implementation
  const AssetToken = await ethers.getContractFactory("AssetToken");
  const assetTokenImpl = await AssetToken.deploy();

  // Deploy AssetFactory
  const AssetFactory = await ethers.getContractFactory("AssetFactory");
  const assetFactory = await AssetFactory.deploy();
  await assetFactory.initialize(
    await admin.getAddress(),
    await assetTokenImpl.getAddress(),
    await identityRegistry.getAddress(),
    await complianceModule.getAddress(),
    await circuitBreaker.getAddress()
  );

  // Deploy AssetOracle
  const AssetOracle = await ethers.getContractFactory("AssetOracle");
  const assetOracle = await AssetOracle.deploy();
  await assetOracle.initialize(await admin.getAddress());

  // Deploy AssetRegistry
  const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await AssetRegistry.deploy();
  await assetRegistry.initialize(await admin.getAddress());

  // Deploy plugins
  const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
  const realEstatePlugin = await RealEstatePlugin.deploy();

  const FineArtPlugin = await ethers.getContractFactory("FineArtPlugin");
  const fineArtPlugin = await FineArtPlugin.deploy();

  const CarbonCreditPlugin = await ethers.getContractFactory("CarbonCreditPlugin");
  const carbonCreditPlugin = await CarbonCreditPlugin.deploy();

  // Register plugins
  const CATEGORY_ID_REAL_ESTATE = await realEstatePlugin.getCategoryId();
  const CATEGORY_ID_FINE_ART = await fineArtPlugin.getCategoryId();
  const CATEGORY_ID_CARBON_CREDIT = await carbonCreditPlugin.getCategoryId();

  await assetFactory.registerPlugin(CATEGORY_ID_REAL_ESTATE, await realEstatePlugin.getAddress());
  await assetFactory.registerPlugin(CATEGORY_ID_FINE_ART, await fineArtPlugin.getAddress());
  await assetFactory.registerPlugin(CATEGORY_ID_CARBON_CREDIT, await carbonCreditPlugin.getAddress());

  return {
    assetTokenImpl,
    assetFactory,
    assetOracle,
    assetRegistry,
    realEstatePlugin,
    fineArtPlugin,
    carbonCreditPlugin,
    CATEGORY_ID_REAL_ESTATE,
    CATEGORY_ID_FINE_ART,
    CATEGORY_ID_CARBON_CREDIT,
  };
}

/**
 * @dev Register a test identity
 * @param identitySBT - IdentitySBT contract instance
 * @param identityRegistry - IdentityRegistry contract (not used here)
 * @param kycProvider - The KYC provider signer who will register the identity
 * @param user - The user to register
 * @param jurisdiction - Jurisdiction code
 * @param role - User role
 */
async function registerIdentity(identitySBT, identityRegistry, kycProvider, user, jurisdiction, role) {
  const didHash = ethers.keccak256(ethers.toUtf8Bytes(`did:crats:${user.address}`));
  const did = `did:crats:${user.address}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 63072000;

  // Grant IDENTITY_MANAGER_ROLE to kycProvider if not already granted
  const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
  const hasRole = await identitySBT.hasRole(IDENTITY_MANAGER_ROLE, kycProvider.address);
  if (!hasRole) {
    // Admin (deployer) grants the role to kycProvider
    const signers = await ethers.getSigners();
    const admin = signers[0]; // First signer is admin
    await identitySBT.connect(admin).grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);
  }

  await identitySBT.connect(kycProvider).registerIdentity(
    user.address,
    role,
    jurisdiction,
    didHash,
    did,
    expiresAt
  );
}

/**
 * @dev Create a test asset
 */
async function createTestAsset(assetFactory, issuer, category, name, symbol, initialSupply) {
  const tx = await assetFactory.connect(issuer).deployAsset(
    name,
    symbol,
    initialSupply,
    category
  );
  const receipt = await tx.wait();

  // Parse AssetDeployed event
  const event = receipt.logs.find(log => {
    try {
      const parsed = assetFactory.interface.parseLog(log);
      return parsed.name === "AssetDeployed";
    } catch {
      return false;
    }
  });

  if (!event) throw new Error("AssetDeployed event not found");

  const tokenAddress = event.args.token;
  const AssetToken = await ethers.getContractFactory("AssetToken");
  const assetToken = AssetToken.attach(tokenAddress);

  return { tokenAddress, assetToken };
}

/**
 * @dev Deploy Layer 3 Vault contracts (templates only)
 */
async function deployLayer3Templates() {
  const [admin] = await ethers.getSigners();

  // Deploy SyncVault template
  const SyncVault = await ethers.getContractFactory("SyncVault");
  const syncVaultTemplate = await SyncVault.deploy(
    ethers.ZeroAddress,
    "CRATS Sync Vault",
    "cSV",
    admin.address
  );
  await syncVaultTemplate.waitForDeployment();

  // Deploy AsyncVault template
  const AsyncVault = await ethers.getContractFactory("AsyncVault");
  const asyncVaultTemplate = await AsyncVault.deploy(
    ethers.ZeroAddress,
    "CRATS Async Vault",
    "cAV",
    admin.address
  );
  await asyncVaultTemplate.waitForDeployment();

  return {
    syncVaultTemplate,
    asyncVaultTemplate,
  };
}

/**
 * @dev Deploy and initialize all Layer 3 contracts
 */
async function deployAndInitializeLayer3(layer1Contracts, layer2Contracts) {
  const [admin, user1, user2, vaultCreator, distributor, processor] = await ethers.getSigners();

  const { identityRegistry, complianceModule, investorRightsRegistry } = layer1Contracts;
  const { circuitBreaker } = layer2Contracts || {};

  // Deploy templates
  const SyncVault = await ethers.getContractFactory("SyncVault");
  const syncVaultTemplate = await SyncVault.deploy(
    ethers.ZeroAddress,
    "CRATS Sync Vault",
    "cSV",
    admin.address
  );
  await syncVaultTemplate.waitForDeployment();

  const AsyncVault = await ethers.getContractFactory("AsyncVault");
  const asyncVaultTemplate = await AsyncVault.deploy(
    ethers.ZeroAddress,
    "CRATS Async Vault",
    "cAV",
    admin.address
  );
  await asyncVaultTemplate.waitForDeployment();

  // Deploy VaultFactory
  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const vaultFactory = await VaultFactory.deploy(admin.address);
  await vaultFactory.waitForDeployment();

  // Deploy YieldDistributor
  const YieldDistributor = await ethers.getContractFactory("YieldDistributor");
  const yieldDistributor = await YieldDistributor.deploy(admin.address);
  await yieldDistributor.waitForDeployment();

  // Deploy RedemptionManager
  const RedemptionManager = await ethers.getContractFactory("RedemptionManager");
  const redemptionManager = await RedemptionManager.deploy(admin.address);
  await redemptionManager.waitForDeployment();

  // Configure VaultFactory
  await vaultFactory.setSyncVaultTemplate(await syncVaultTemplate.getAddress());
  await vaultFactory.setAsyncVaultTemplate(await asyncVaultTemplate.getAddress());
  await vaultFactory.setIdentityRegistry(await identityRegistry.getAddress());
  await vaultFactory.setComplianceModule(await complianceModule.getAddress());
  if (circuitBreaker) {
    await vaultFactory.setCircuitBreakerModule(await circuitBreaker.getAddress());
  }
  await vaultFactory.setYieldDistributor(await yieldDistributor.getAddress());
  await vaultFactory.setRedemptionManager(await redemptionManager.getAddress());

  // Configure YieldDistributor
  await yieldDistributor.setVaultRegistry(await vaultFactory.getAddress());
  await yieldDistributor.setInvestorRightsRegistry(await investorRightsRegistry.getAddress());

  // Configure RedemptionManager
  await redemptionManager.setVaultRegistry(await vaultFactory.getAddress());
  await redemptionManager.setIdentityRegistry(await identityRegistry.getAddress());

  // Grant roles
  const VAULT_CREATOR_ROLE = await vaultFactory.VAULT_CREATOR_ROLE();
  const DISTRIBUTOR_ROLE = await yieldDistributor.DISTRIBUTOR_ROLE();
  const PROCESSOR_ROLE = await redemptionManager.PROCESSOR_ROLE();

  await vaultFactory.grantRole(VAULT_CREATOR_ROLE, vaultCreator.address);
  await yieldDistributor.grantRole(DISTRIBUTOR_ROLE, distributor.address);
  await redemptionManager.grantRole(PROCESSOR_ROLE, processor.address);

  return {
    syncVaultTemplate,
    asyncVaultTemplate,
    vaultFactory,
    yieldDistributor,
    redemptionManager,
    VAULT_CREATOR_ROLE,
    DISTRIBUTOR_ROLE,
    PROCESSOR_ROLE,
  };
}

/**
 * @dev Create a test vault using VaultFactory
 * @param vaultFactory - VaultFactory contract instance
 * @param creator - Signer with VAULT_CREATOR_ROLE
 * @param asset - Underlying asset address
 * @param name - Vault name
 * @param symbol - Vault symbol
 * @param category - Vault category (bytes32)
 * @param vaultType - 0 for SYNC, 1 for ASYNC
 */
async function createTestVault(vaultFactory, creator, asset, name, symbol, category, vaultType = 0) {
  let tx;
  
  if (vaultType === 0) {
    // Sync vault
    tx = await vaultFactory.connect(creator).createSyncVault(
      asset,
      name,
      symbol,
      category
    );
  } else {
    // Async vault
    tx = await vaultFactory.connect(creator).createAsyncVault(
      asset,
      name,
      symbol,
      category,
      24 * 60 * 60, // Deposit settlement
      7 * 24 * 60 * 60 // Redeem settlement
    );
  }

  const receipt = await tx.wait();

  // Parse VaultCreated event
  const event = receipt.logs.find(log => {
    try {
      const parsed = vaultFactory.interface.parseLog(log);
      return parsed.name === "VaultCreated";
    } catch {
      return false;
    }
  });

  if (!event) throw new Error("VaultCreated event not found");

  const vaultAddress = event.args.vault;

  // Attach to vault contract
  const VaultContract = vaultType === 0 
    ? await ethers.getContractFactory("SyncVault")
    : await ethers.getContractFactory("AsyncVault");
  const vault = VaultContract.attach(vaultAddress);

  return { vaultAddress, vault };
}

/**
 * @dev Create a yield schedule
 * @param yieldDistributor - YieldDistributor contract instance
 * @param creator - Signer with VAULT_CREATOR_ROLE
 * @param vault - Vault address
 * @param yieldToken - Yield token address
 * @param name - Schedule name
 * @param amount - Yield amount per period
 * @param frequency - Frequency in seconds
 * @param yieldType - Yield type (0-6)
 */
async function createYieldSchedule(yieldDistributor, creator, vault, yieldToken, name, amount, frequency, yieldType) {
  const tx = await yieldDistributor.connect(creator).createYieldSchedule(
    vault,
    name,
    yieldToken,
    amount,
    frequency,
    yieldType
  );
  const receipt = await tx.wait();

  // Parse YieldScheduleCreated event
  const event = receipt.logs.find(log => {
    try {
      const parsed = yieldDistributor.interface.parseLog(log);
      return parsed.name === "YieldScheduleCreated";
    } catch {
      return false;
    }
  });

  if (!event) throw new Error("YieldScheduleCreated event not found");

  return {
    scheduleId: event.args.scheduleId,
    tx,
    receipt
  };
}

/**
 * @dev Category constants
 */
const CATEGORIES = {
  REAL_ESTATE: ethers.keccak256(ethers.toUtf8Bytes("REAL_ESTATE")),
  FINE_ART: ethers.keccak256(ethers.toUtf8Bytes("FINE_ART")),
  CARBON_CREDIT: ethers.keccak256(ethers.toUtf8Bytes("CARBON_CREDIT")),
  PRIVATE_EQUITY: ethers.keccak256(ethers.toUtf8Bytes("PRIVATE_EQUITY")),
  COMMODITIES: ethers.keccak256(ethers.toUtf8Bytes("COMMODITIES")),
};

/**
 * @dev Yield type constants
 */
const YIELD_TYPES = {
  RENTAL_INCOME: 0,
  DIVIDEND: 1,
  INTEREST: 2,
  ROYALTY: 3,
  CAPITAL_GAINS: 4,
  REFINANCING: 5,
  OTHER: 6,
};

/**
 * @dev Vault type constants
 */
const VAULT_TYPES = {
  SYNC: 0,  // ERC-4626 (atomic)
  ASYNC: 1, // ERC-7540 (request/claim)
};

module.exports = {
  DEFAULT_ADDRESSES,
  DEFAULT_VALUES,
  CATEGORIES,
  YIELD_TYPES,
  VAULT_TYPES,
  deployUpgradeable,
  deployUpgradeableFQ,
  deployLayer1Fixtures,
  deployLayer2Fixtures,
  deployLayer3Templates,
  deployAndInitializeLayer3,
  createTestVault,
  createYieldSchedule,
  registerIdentity,
  createTestAsset,
};
