const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("========================================");
  console.log("CRATS Protocol Layer 3 Deployment - Financial Abstraction");
  console.log("========================================\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Load Layer 1 and 2 addresses
  const deploymentFile = path.join(process.cwd(), "deployments", `${hre.network.name}-deployment.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}. Run Layer 1 and 2 first.`);
  }

  const deploymentInfoBase = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const L1 = deploymentInfoBase.contracts;
  const L2 = deploymentInfoBase.contracts; 

  // ========== DEPLOY LAYER 3 CONTRACTS ==========

  // 1. Deploy SyncVault Template (ERC-4626)
  console.log("\n1️⃣  Deploying SyncVault Template (ERC-4626)...");
  const SyncVault = await hre.ethers.getContractFactory("SyncVault");
  const syncVaultTemplate = await SyncVault.deploy();
  await syncVaultTemplate.waitForDeployment();
  const syncVaultTemplateAddress = await syncVaultTemplate.getAddress();
  console.log("  ✅ SyncVault Template:", syncVaultTemplateAddress);
  
  // 2. Deploy AsyncVault Template
  console.log("\n2️⃣  Deploying AsyncVault Template...");
  const AsyncVault = await hre.ethers.getContractFactory("AsyncVault");
  const asyncVaultTemplate = await AsyncVault.deploy();
  await asyncVaultTemplate.waitForDeployment();
  const asyncVaultTemplateAddress = await asyncVaultTemplate.getAddress();
  console.log("  ✅ AsyncVault Template:", asyncVaultTemplateAddress);
  
  // 3. Deploy VaultFactory
  console.log("\n3️⃣  Deploying VaultFactory...");
  const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
  const vaultFactory = await VaultFactory.deploy(deployer.address);
  await vaultFactory.waitForDeployment();
  const vaultFactoryAddress = await vaultFactory.getAddress();
  console.log("  ✅ VaultFactory:", vaultFactoryAddress);

  // 4. Deploy YieldDistributor
  console.log("\n4️⃣  Deploying YieldDistributor...");
  const YieldDistributor = await hre.ethers.getContractFactory("YieldDistributor");
  const yieldDistributor = await YieldDistributor.deploy(deployer.address);
  await yieldDistributor.waitForDeployment();
  const yieldDistributorAddress = await yieldDistributor.getAddress();
  console.log("  ✅ YieldDistributor:", yieldDistributorAddress);

  // ========== CONFIGURATION ==========
  console.log("\n🔧 Configuring VaultFactory...");
  
  await vaultFactory.setSyncVaultTemplate(syncVaultTemplateAddress);
  await vaultFactory.setAsyncVaultTemplate(asyncVaultTemplateAddress);
  
  if (L1.identityRegistry) {
    await vaultFactory.setIdentityRegistry(L1.identityRegistry);
  }
  if (L1.complianceModule) {
    await vaultFactory.setComplianceModule(L1.complianceModule);
  }
  if (L2.circuitBreaker) {
    await vaultFactory.setCircuitBreakerModule(L2.circuitBreaker);
  }
  await vaultFactory.setYieldDistributor(yieldDistributorAddress);
  
  if (L2.assetFactory) {
    console.log("\n🔗 Linking VaultFactory to AssetFactory...");
    await vaultFactory.setAssetFactory(L2.assetFactory);
    
    // Grant VAULT_FACTORY_ROLE to VaultFactory on AssetFactory
    const AssetFactoryContract = await hre.ethers.getContractAt("AssetFactory", L2.assetFactory);
    const VAULT_FACTORY_ROLE = hre.ethers.id("VAULT_FACTORY_ROLE");
    await AssetFactoryContract.grantRole(VAULT_FACTORY_ROLE, vaultFactoryAddress);
    console.log("  ✅ Link and Role Grant Complete");
  }

  // ========== PERSISTENCE ==========
  let deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  deploymentInfo.contracts.syncVaultTemplate = syncVaultTemplateAddress;
  deploymentInfo.contracts.asyncVaultTemplate = asyncVaultTemplateAddress;
  deploymentInfo.contracts.vaultFactory = vaultFactoryAddress;
  deploymentInfo.contracts.yieldDistributor = yieldDistributorAddress;

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info updated in:", deploymentFile);
  console.log("🎉 LAYER 3 DEPLOYMENT COMPLETE!");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
