const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * CRATS Protocol - Unified Master Deployment (v3.1.0 - Robust)
 * 
 * Includes:
 * - Incremental progress saving
 * - Priority Gas (5.0 Gwei)
 * - BOR (AssetRegistry) Integration
 */

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("   CRATS PROTOCOL - UNIFIED MASTER DEPLOYMENT (v3.1.0)");
  console.log("=".repeat(80) + "\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  
  console.log("Master Deployer:", deployer.address);
  console.log("Network:", network);
  
  const deployed = {};
  const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);

  const saveProgress = () => {
    const info = {
      network,
      chainId: chainId.toString(),
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: deployed
    };
    fs.writeFileSync(deploymentFile, JSON.stringify(info, null, 2));
    console.log(`  💾 Progress saved to ${path.basename(deploymentFile)}`);
  };

  try {
    // --- 🔹 PHASE 1: IDENTITY (L1) ---
    console.log("\n>>> [1/4] DEPLOYING LAYER 1 (IDENTITY)...");
    
    // Explicitly high gas price for Sepolia
    const gasPrice = hre.ethers.parseUnits("10", "gwei"); 
    console.log("Using Priority Gas Price: 10.0 Gwei");

    const KYCRegistry = await hre.ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await hre.upgrades.deployProxy(KYCRegistry, [deployer.address], { 
      kind: "uups",
      txOverrides: { gasPrice } 
    });
    await kycRegistry.waitForDeployment();
    deployed.kycRegistry = await kycRegistry.getAddress();
    console.log("  ✅ KYCRegistry:", deployed.kycRegistry);
    saveProgress();

    const IdentitySBT = await hre.ethers.getContractFactory("IdentitySBT");
    const identitySBT = await hre.upgrades.deployProxy(IdentitySBT, ["CRATS Identity", "CRATS-ID", deployer.address], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await identitySBT.waitForDeployment();
    deployed.identitySBT = await identitySBT.getAddress();
    console.log("  ✅ IdentitySBT:", deployed.identitySBT);
    saveProgress();

    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await hre.upgrades.deployProxy(IdentityRegistry, [deployer.address, deployed.identitySBT, deployed.kycRegistry], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await identityRegistry.waitForDeployment();
    deployed.identityRegistry = await identityRegistry.getAddress();
    console.log("  ✅ IdentityRegistry:", deployed.identityRegistry);
    saveProgress();

    const Compliance = await hre.ethers.getContractFactory("Compliance");
    const complianceModule = await hre.upgrades.deployProxy(Compliance, [deployer.address, deployed.identityRegistry], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await complianceModule.waitForDeployment();
    deployed.complianceModule = await complianceModule.getAddress();
    console.log("  ✅ ComplianceModule:", deployed.complianceModule);
    saveProgress();

    const TravelRuleModule = await hre.ethers.getContractFactory("TravelRuleModule");
    const travelRuleModule = await hre.upgrades.deployProxy(TravelRuleModule, [deployer.address, deployed.identityRegistry, hre.ethers.parseEther("1000")], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await travelRuleModule.waitForDeployment();
    deployed.travelRuleModule = await travelRuleModule.getAddress();
    saveProgress();

    const InvestorRightsRegistry = await hre.ethers.getContractFactory("InvestorRightsRegistry");
    const investorRightsRegistry = await hre.upgrades.deployProxy(InvestorRightsRegistry, [deployer.address, deployed.identityRegistry], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await investorRightsRegistry.waitForDeployment();
    deployed.investorRightsRegistry = await investorRightsRegistry.getAddress();
    saveProgress();

    // --- 🔹 PHASE 2: TOKENIZATION (L2) ---
    console.log("\n>>> [2/4] DEPLOYING LAYER 2 (TOKENIZATION)...");

    const CircuitBreakerModule = await hre.ethers.getContractFactory("contracts/asset/CircuitBreakerModule.sol:CircuitBreakerModule");
    const circuitBreaker = await hre.upgrades.deployProxy(CircuitBreakerModule, [deployer.address], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await circuitBreaker.waitForDeployment();
    deployed.circuitBreaker = await circuitBreaker.getAddress();
    saveProgress();

    const AssetToken = await hre.ethers.getContractFactory("AssetToken");
    const assetTokenImpl = await AssetToken.deploy({ gasPrice }); 
    await assetTokenImpl.waitForDeployment();
    deployed.assetTokenTemplate = await assetTokenImpl.getAddress();
    saveProgress();

    const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
    const assetFactory = await hre.upgrades.deployProxy(
        AssetFactory, 
        [deployer.address, deployed.assetTokenTemplate, deployed.identityRegistry, deployed.complianceModule, deployed.circuitBreaker], 
        { 
          kind: "uups",
          txOverrides: { gasPrice }
        }
    );
    await assetFactory.waitForDeployment();
    deployed.assetFactory = await assetFactory.getAddress();
    console.log("  ✅ AssetFactory:", deployed.assetFactory);
    saveProgress();

    // 5. Deploy AssetRegistry Proxy (BOR Module)
    console.log("  Deploying AssetRegistry...");
    const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
    const assetRegistry = await hre.upgrades.deployProxy(AssetRegistry, [deployer.address], { 
      kind: "uups",
      txOverrides: { gasPrice }
    });
    await assetRegistry.waitForDeployment();
    deployed.assetRegistry = await assetRegistry.getAddress();
    console.log("  ✅ AssetRegistry:", deployed.assetRegistry);
    saveProgress();

    // Link Registry to Factory
    await (await assetFactory.setAssetRegistry(deployed.assetRegistry, { gasPrice })).wait();
    await (await assetRegistry.addOperator(deployed.assetFactory, { gasPrice })).wait();

    // Register REAL_ESTATE Plugin
    const REAL_ESTATE = hre.ethers.id("REAL_ESTATE");
    const RealEstatePlugin = await hre.ethers.getContractFactory("RealEstatePlugin");
    const realEstatePlugin = await RealEstatePlugin.deploy({ gasPrice });
    await realEstatePlugin.waitForDeployment();
    deployed.realEstatePlugin = await realEstatePlugin.getAddress();
    await (await assetFactory.registerPlugin(REAL_ESTATE, deployed.realEstatePlugin, { gasPrice })).wait();
    saveProgress();

    // --- 🔹 PHASE 3: FINANCIAL (L3) ---
    console.log("\n>>> [3/4] DEPLOYING LAYER 3 (FINANCIAL)...");

    const SyncVault = await hre.ethers.getContractFactory("SyncVault");
    const syncVaultTemplate = await SyncVault.deploy({ gasPrice }); 
    await syncVaultTemplate.waitForDeployment();
    deployed.syncVaultTemplate = await syncVaultTemplate.getAddress();
    saveProgress();

    const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
    const vaultFactory = await VaultFactory.deploy(deployer.address, { gasPrice }); 
    await vaultFactory.waitForDeployment();
    deployed.vaultFactory = await vaultFactory.getAddress();
    console.log("  ✅ VaultFactory:", deployed.vaultFactory);
    saveProgress();

    const YieldDistributor = await hre.ethers.getContractFactory("YieldDistributor");
    const yieldDistributor = await YieldDistributor.deploy(deployer.address, { gasPrice }); 
    await yieldDistributor.waitForDeployment();
    deployed.yieldDistributor = await yieldDistributor.getAddress();
    saveProgress();

    // Configure Vault Factory
    await (await vaultFactory.setAssetFactory(deployed.assetFactory, { gasPrice })).wait();
    await (await vaultFactory.setSyncVaultTemplate(deployed.syncVaultTemplate, { gasPrice })).wait();
    await (await vaultFactory.setIdentityRegistry(deployed.identityRegistry, { gasPrice })).wait();
    await (await vaultFactory.setComplianceModule(deployed.complianceModule, { gasPrice })).wait();
    await (await vaultFactory.setCircuitBreakerModule(deployed.circuitBreaker, { gasPrice })).wait();
    await (await vaultFactory.setYieldDistributor(deployed.yieldDistributor, { gasPrice })).wait();
    
    // Auth Factory in Registry
    await (await assetRegistry.addOperator(deployed.vaultFactory, { gasPrice })).wait();
    console.log("  ✅ Financial Layer Configured");
    saveProgress();

    // --- 🔹 PHASE 4: MARKETPLACE (L4) ---
    console.log("\n>>> [4/4] DEPLOYING LAYER 4 (MARKETPLACE)...");

    const MarketplaceFactory = await hre.ethers.getContractFactory("MarketplaceFactory");
    const marketplaceFactory = await MarketplaceFactory.deploy({ gasPrice }); 
    await marketplaceFactory.waitForDeployment();
    deployed.marketplaceFactory = await marketplaceFactory.getAddress();
    saveProgress();

    const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
    const settlementEngine = await SettlementEngine.deploy({ gasPrice });
    await settlementEngine.waitForDeployment();
    deployed.settlementEngine = await settlementEngine.getAddress();
    saveProgress();

    const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
    const clearingHouse = await ClearingHouse.deploy({ gasPrice });
    await clearingHouse.waitForDeployment();
    deployed.clearingHouse = await clearingHouse.getAddress();
    saveProgress();

    await (await settlementEngine.setComplianceConfig(deployed.identityRegistry, deployed.complianceModule, { gasPrice })).wait();
    await (await settlementEngine.authorizeSettler(deployed.clearingHouse, { gasPrice })).wait();
    await (await clearingHouse.setSettlementEngine(deployed.settlementEngine, { gasPrice })).wait();
    await (await clearingHouse.setIdentityRegistry(deployed.identityRegistry, { gasPrice })).wait();
    console.log("  ✅ Marketplace Layer Configured");
    saveProgress();

    console.log("\n" + "=".repeat(80));
    console.log("🎉 SUCCESS: CRATS PROTOCOL v3.1 FULLY DEPLOYED!");
    console.log("💾 Final Registry Saved to:", deploymentFile);
    console.log("=".repeat(80) + "\n");

  } catch (error) {
    console.error("\n❌ MASTER DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  }
}

main();
