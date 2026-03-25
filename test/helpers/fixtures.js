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

module.exports = {
  DEFAULT_ADDRESSES,
  DEFAULT_VALUES,
  deployUpgradeable,
  deployUpgradeableFQ,
  deployLayer1Fixtures,
  deployLayer2Fixtures,
  registerIdentity,
  createTestAsset,
};
