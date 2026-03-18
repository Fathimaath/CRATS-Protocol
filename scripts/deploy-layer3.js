const hre = require("hardhat");

/**
 * CRATS Protocol Layer 3 Deployment Script
 * 
 * Deploys:
 * 1. SyncVault Template (ERC-4626)
 * 2. AsyncVault Template (ERC-7540)
 * 3. VaultFactory
 * 4. YieldDistributor
 * 5. RedemptionManager
 * 
 * Dependencies:
 * - Layer 1: IdentityRegistry, ComplianceModule
 * - Layer 2: AssetToken (underlying assets)
 */

async function main() {
  console.log("========================================");
  console.log("CRATS Protocol Layer 3 Deployment");
  console.log("========================================\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Get Layer 1 contract addresses from environment or config
  const LAYER1_ADDRESSES = {
    identityRegistry: process.env.IDENTITY_REGISTRY_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    complianceModule: process.env.COMPLIANCE_MODULE_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    travelRuleModule: process.env.TRAVEL_RULE_MODULE_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    investorRightsRegistry: process.env.INVESTOR_RIGHTS_REGISTRY_ADDRESS || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
  };

  // Get Layer 2 contract addresses
  const LAYER2_ADDRESSES = {
    assetFactory: process.env.ASSET_FACTORY_ADDRESS || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    circuitBreaker: process.env.CIRCUIT_BREAKER_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F87570C"
  };

  console.log("📋 Layer 1 Dependencies:");
  console.log("  Identity Registry:", LAYER1_ADDRESSES.identityRegistry);
  console.log("  Compliance Module:", LAYER1_ADDRESSES.complianceModule);
  console.log("  Travel Rule Module:", LAYER1_ADDRESSES.travelRuleModule);
  console.log("  Investor Rights Registry:", LAYER1_ADDRESSES.investorRightsRegistry);

  console.log("\n📋 Layer 2 Dependencies:");
  console.log("  Asset Factory:", LAYER2_ADDRESSES.assetFactory);
  console.log("  Circuit Breaker:", LAYER2_ADDRESSES.circuitBreaker);

  // Store deployed contract addresses
  const deployedContracts = {};

  // ========== DEPLOY TEMPLATES ==========

  // 1. Deploy SyncVault Template
  console.log("\n1️⃣  Deploying SyncVault Template (ERC-4626)...");
  const SyncVault = await hre.ethers.getContractFactory("SyncVault");
  const syncVaultTemplate = await SyncVault.deploy(
    "0x0000000000000000000000000000000000000000", // Placeholder asset
    "CRATS Sync Vault",
    "cRV",
    deployer.address
  );
  await syncVaultTemplate.waitForDeployment();
  deployedContracts.syncVaultTemplate = await syncVaultTemplate.getAddress();
  console.log("  ✅ SyncVault Template:", deployedContracts.syncVaultTemplate);

  // 2. Deploy AsyncVault Template
  console.log("\n2️⃣  Deploying AsyncVault Template (ERC-7540)...");
  const AsyncVault = await hre.ethers.getContractFactory("AsyncVault");
  const asyncVaultTemplate = await AsyncVault.deploy(
    "0x0000000000000000000000000000000000000000", // Placeholder asset
    "CRATS Async Vault",
    "cAV",
    deployer.address
  );
  await asyncVaultTemplate.waitForDeployment();
  deployedContracts.asyncVaultTemplate = await asyncVaultTemplate.getAddress();
  console.log("  ✅ AsyncVault Template:", deployedContracts.asyncVaultTemplate);

  // 3. Deploy VaultFactory
  console.log("\n3️⃣  Deploying VaultFactory...");
  const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
  const vaultFactory = await VaultFactory.deploy(deployer.address);
  await vaultFactory.waitForDeployment();
  deployedContracts.vaultFactory = await vaultFactory.getAddress();
  console.log("  ✅ VaultFactory:", deployedContracts.vaultFactory);

  // 4. Deploy YieldDistributor
  console.log("\n4️⃣  Deploying YieldDistributor...");
  const YieldDistributor = await hre.ethers.getContractFactory("YieldDistributor");
  const yieldDistributor = await YieldDistributor.deploy(deployer.address);
  await yieldDistributor.waitForDeployment();
  deployedContracts.yieldDistributor = await yieldDistributor.getAddress();
  console.log("  ✅ YieldDistributor:", deployedContracts.yieldDistributor);

  // 5. Deploy RedemptionManager
  console.log("\n5️⃣  Deploying RedemptionManager...");
  const RedemptionManager = await hre.ethers.getContractFactory("RedemptionManager");
  const redemptionManager = await RedemptionManager.deploy(deployer.address);
  await redemptionManager.waitForDeployment();
  deployedContracts.redemptionManager = await redemptionManager.getAddress();
  console.log("  ✅ RedemptionManager:", deployedContracts.redemptionManager);

  // ========== CONFIGURE CONTRACTS ==========

  console.log("\n🔧 Configuring contracts...\n");

  // Configure VaultFactory with templates
  console.log("  Setting vault templates...");
  await vaultFactory.setSyncVaultTemplate(deployedContracts.syncVaultTemplate);
  console.log("    ✅ SyncVault template set");

  await vaultFactory.setAsyncVaultTemplate(deployedContracts.asyncVaultTemplate);
  console.log("    ✅ AsyncVault template set");

  // Configure VaultFactory with Layer 1 dependencies
  console.log("\n  Setting Layer 1 dependencies...");
  await vaultFactory.setIdentityRegistry(LAYER1_ADDRESSES.identityRegistry);
  console.log("    ✅ Identity Registry configured");

  await vaultFactory.setComplianceModule(LAYER1_ADDRESSES.complianceModule);
  console.log("    ✅ Compliance Module configured");

  await vaultFactory.setCircuitBreakerModule(LAYER2_ADDRESSES.circuitBreaker);
  console.log("    ✅ Circuit Breaker configured");

  await vaultFactory.setYieldDistributor(deployedContracts.yieldDistributor);
  console.log("    ✅ Yield Distributor configured");

  await vaultFactory.setRedemptionManager(deployedContracts.redemptionManager);
  console.log("    ✅ Redemption Manager configured");

  // Configure YieldDistributor
  console.log("\n  Configuring YieldDistributor...");
  await yieldDistributor.setVaultRegistry(deployedContracts.vaultFactory);
  await yieldDistributor.setInvestorRightsRegistry(LAYER1_ADDRESSES.investorRightsRegistry);
  console.log("    ✅ Vault Registry configured");
  console.log("    ✅ Investor Rights Registry configured");

  // Configure RedemptionManager
  console.log("\n  Configuring RedemptionManager...");
  await redemptionManager.setVaultRegistry(deployedContracts.vaultFactory);
  await redemptionManager.setIdentityRegistry(LAYER1_ADDRESSES.identityRegistry);
  console.log("    ✅ Vault Registry configured");
  console.log("    ✅ Identity Registry configured");

  // Grant roles
  console.log("\n  Configuring roles...");
  const VAULT_CREATOR_ROLE = hre.ethers.id("VAULT_CREATOR_ROLE");
  const PROCESSOR_ROLE = hre.ethers.id("PROCESSOR_ROLE");
  const DISTRIBUTOR_ROLE = hre.ethers.id("DISTRIBUTOR_ROLE");

  await vaultFactory.grantRole(VAULT_CREATOR_ROLE, deployer.address);
  console.log("    ✅ VAULT_CREATOR_ROLE granted to deployer");

  await redemptionManager.grantRole(PROCESSOR_ROLE, deployer.address);
  console.log("    ✅ PROCESSOR_ROLE granted to deployer");

  await yieldDistributor.grantRole(DISTRIBUTOR_ROLE, deployer.address);
  console.log("    ✅ DISTRIBUTOR_ROLE granted to deployer");

  // ========== FINAL SUMMARY ==========

  console.log("\n" + "=".repeat(70));
  console.log("🎉 LAYER 3 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(70));

  console.log("\n📦 CORE CONTRACTS:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │ SyncVault Template:    ", deployedContracts.syncVaultTemplate.padEnd(40) + "│");
  console.log("  │ AsyncVault Template:   ", deployedContracts.asyncVaultTemplate.padEnd(40) + "│");
  console.log("  │ VaultFactory:          ", deployedContracts.vaultFactory.padEnd(40) + "│");
  console.log("  │ YieldDistributor:      ", deployedContracts.yieldDistributor.padEnd(40) + "│");
  console.log("  │ RedemptionManager:     ", deployedContracts.redemptionManager.padEnd(40) + "│");
  console.log("  └─────────────────────────────────────────────────────────────┘");

  console.log("\n🔗 LAYER 1 DEPENDENCIES:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │ IdentityRegistry:    ", LAYER1_ADDRESSES.identityRegistry.padEnd(40) + "│");
  console.log("  │ ComplianceModule:    ", LAYER1_ADDRESSES.complianceModule.padEnd(40) + "│");
  console.log("  │ InvestorRights:      ", LAYER1_ADDRESSES.investorRightsRegistry.padEnd(40) + "│");
  console.log("  └─────────────────────────────────────────────────────────────┘");

  console.log("\n🔗 LAYER 2 DEPENDENCIES:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │ AssetFactory:        ", LAYER2_ADDRESSES.assetFactory.padEnd(40) + "│");
  console.log("  │ CircuitBreaker:      ", LAYER2_ADDRESSES.circuitBreaker.padEnd(40) + "│");
  console.log("  └─────────────────────────────────────────────────────────────┘");

  console.log("\n✅ All contracts deployed and configured successfully!");
  console.log("=".repeat(70));

  // Save deployment info to file
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    layer1: LAYER1_ADDRESSES,
    layer2: LAYER2_ADDRESSES,
    layer3: deployedContracts
  };

  const fs = require("fs");
  const path = require("path");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const fileName = `layer3-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, fileName),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾 Deployment info saved to: deployments/" + fileName);
  console.log("\n📝 Next steps:");
  console.log("  1. Verify contracts on Etherscan (if mainnet/testnet)");
  console.log("  2. Create vaults: await vaultFactory.createSyncVault(...)");
  console.log("  3. Create yield schedules: await yieldDistributor.createYieldSchedule(...)");
  console.log("  4. Test deposit/redeem flows");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
