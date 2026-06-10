const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * CRATS Protocol - Unified Master Deployment (v3.1.0 - Robust & Resumable)
 * 
 * Includes:
 * - Incremental progress saving and resumption support
 * - Dynamic priority gas calculation with safety buffers
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
  
  let deployed = {};
  const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);

  // Load existing progress if any
  if (fs.existsSync(deploymentFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
      if (data.contracts) {
        deployed = data.contracts;
        console.log(`Loaded existing progress for ${network} from ${path.basename(deploymentFile)}`);
      }
    } catch (e) {
      console.log("Error reading progress file, starting fresh.");
    }
  }

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
    
    // Dynamically fetch gas price from provider with a safety buffer
    const feeData = await hre.ethers.provider.getFeeData();
    let gasPrice = feeData.gasPrice;
    if (gasPrice) {
        gasPrice = (gasPrice * 130n) / 100n; // 30% buffer
    } else {
        gasPrice = hre.ethers.parseUnits("30", "gwei"); // Fallback
    }
    console.log(`Using gasPrice: ${hre.ethers.formatUnits(gasPrice, "gwei")} Gwei`);

    let kycRegistry;
    if (!deployed.kycRegistry) {
      const KYCRegistry = await hre.ethers.getContractFactory("KYCProvidersRegistry");
      kycRegistry = await hre.upgrades.deployProxy(KYCRegistry, [deployer.address], { 
        kind: "uups",
        txOverrides: { gasPrice } 
      });
      await kycRegistry.waitForDeployment();
      deployed.kycRegistry = await kycRegistry.getAddress();
      console.log("  ✅ KYCRegistry:", deployed.kycRegistry);
      saveProgress();
    } else {
      kycRegistry = await hre.ethers.getContractAt("KYCProvidersRegistry", deployed.kycRegistry);
      console.log("  ℹ️ KYCRegistry already deployed at:", deployed.kycRegistry);
    }

    let identitySBT;
    if (!deployed.identitySBT) {
      const IdentitySBT = await hre.ethers.getContractFactory("IdentitySBT");
      identitySBT = await hre.upgrades.deployProxy(IdentitySBT, ["CRATS Identity", "CRATS-ID", deployer.address], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await identitySBT.waitForDeployment();
      deployed.identitySBT = await identitySBT.getAddress();
      console.log("  ✅ IdentitySBT:", deployed.identitySBT);
      saveProgress();
    } else {
      identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployed.identitySBT);
      console.log("  ℹ️ IdentitySBT already deployed at:", deployed.identitySBT);
    }

    let identityRegistry;
    if (!deployed.identityRegistry) {
      const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
      identityRegistry = await hre.upgrades.deployProxy(IdentityRegistry, [deployer.address, deployed.identitySBT, deployed.kycRegistry], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await identityRegistry.waitForDeployment();
      deployed.identityRegistry = await identityRegistry.getAddress();
      console.log("  ✅ IdentityRegistry:", deployed.identityRegistry);
      saveProgress();
    } else {
      identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployed.identityRegistry);
      console.log("  ℹ️ IdentityRegistry already deployed at:", deployed.identityRegistry);
    }

    let complianceModule;
    if (!deployed.complianceModule) {
      const Compliance = await hre.ethers.getContractFactory("Compliance");
      complianceModule = await hre.upgrades.deployProxy(Compliance, [deployer.address, deployed.identityRegistry], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await complianceModule.waitForDeployment();
      deployed.complianceModule = await complianceModule.getAddress();
      console.log("  ✅ ComplianceModule:", deployed.complianceModule);
      saveProgress();
    } else {
      complianceModule = await hre.ethers.getContractAt("Compliance", deployed.complianceModule);
      console.log("  ℹ️ ComplianceModule already deployed at:", deployed.complianceModule);
    }

    let travelRuleModule;
    if (!deployed.travelRuleModule) {
      const TravelRuleModule = await hre.ethers.getContractFactory("TravelRuleModule");
      travelRuleModule = await hre.upgrades.deployProxy(TravelRuleModule, [deployer.address, deployed.identityRegistry, hre.ethers.parseEther("1000")], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await travelRuleModule.waitForDeployment();
      deployed.travelRuleModule = await travelRuleModule.getAddress();
      console.log("  ✅ TravelRuleModule:", deployed.travelRuleModule);
      saveProgress();
    } else {
      travelRuleModule = await hre.ethers.getContractAt("TravelRuleModule", deployed.travelRuleModule);
      console.log("  ℹ️ TravelRuleModule already deployed at:", deployed.travelRuleModule);
    }

    let investorRightsRegistry;
    if (!deployed.investorRightsRegistry) {
      const InvestorRightsRegistry = await hre.ethers.getContractFactory("InvestorRightsRegistry");
      investorRightsRegistry = await hre.upgrades.deployProxy(InvestorRightsRegistry, [deployer.address, deployed.identityRegistry], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await investorRightsRegistry.waitForDeployment();
      deployed.investorRightsRegistry = await investorRightsRegistry.getAddress();
      console.log("  ✅ InvestorRightsRegistry:", deployed.investorRightsRegistry);
      saveProgress();
    } else {
      investorRightsRegistry = await hre.ethers.getContractAt("InvestorRightsRegistry", deployed.investorRightsRegistry);
      console.log("  ℹ️ InvestorRightsRegistry already deployed at:", deployed.investorRightsRegistry);
    }

    // --- 🔹 PHASE 2: TOKENIZATION (L2) ---
    console.log("\n>>> [2/4] DEPLOYING LAYER 2 (TOKENIZATION)...");

    let circuitBreaker;
    if (!deployed.circuitBreaker) {
      const CircuitBreakerModule = await hre.ethers.getContractFactory("contracts/asset/CircuitBreakerModule.sol:CircuitBreakerModule");
      circuitBreaker = await hre.upgrades.deployProxy(CircuitBreakerModule, [deployer.address], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await circuitBreaker.waitForDeployment();
      deployed.circuitBreaker = await circuitBreaker.getAddress();
      console.log("  ✅ CircuitBreakerModule:", deployed.circuitBreaker);
      saveProgress();
    } else {
      circuitBreaker = await hre.ethers.getContractAt("contracts/asset/CircuitBreakerModule.sol:CircuitBreakerModule", deployed.circuitBreaker);
      console.log("  ℹ️ CircuitBreaker already deployed at:", deployed.circuitBreaker);
    }

    let assetTokenTemplate;
    if (!deployed.assetTokenTemplate) {
      const AssetToken = await hre.ethers.getContractFactory("AssetToken");
      const assetTokenImpl = await AssetToken.deploy({ gasPrice }); 
      await assetTokenImpl.waitForDeployment();
      deployed.assetTokenTemplate = await assetTokenImpl.getAddress();
      console.log("  ✅ AssetToken Template:", deployed.assetTokenTemplate);
      saveProgress();
    } else {
      console.log("  ℹ️ AssetToken Template already deployed at:", deployed.assetTokenTemplate);
    }

    let assetFactory;
    if (!deployed.assetFactory) {
      const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
      assetFactory = await hre.upgrades.deployProxy(
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
    } else {
      assetFactory = await hre.ethers.getContractAt("AssetFactory", deployed.assetFactory);
      console.log("  ℹ️ AssetFactory already deployed at:", deployed.assetFactory);
    }

    let assetRegistry;
    if (!deployed.assetRegistry) {
      console.log("  Deploying AssetRegistry...");
      const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
      assetRegistry = await hre.upgrades.deployProxy(AssetRegistry, [deployer.address], { 
        kind: "uups",
        txOverrides: { gasPrice }
      });
      await assetRegistry.waitForDeployment();
      deployed.assetRegistry = await assetRegistry.getAddress();
      console.log("  ✅ AssetRegistry:", deployed.assetRegistry);
      saveProgress();

      // Configure links
      console.log("  Linking AssetRegistry and AssetFactory...");
      await (await assetFactory.setAssetRegistry(deployed.assetRegistry, { gasPrice })).wait();
      await (await assetRegistry.addOperator(deployed.assetFactory, { gasPrice })).wait();
    } else {
      assetRegistry = await hre.ethers.getContractAt("AssetRegistry", deployed.assetRegistry);
      console.log("  ℹ️ AssetRegistry already deployed at:", deployed.assetRegistry);
    }

    let realEstatePlugin;
    if (!deployed.realEstatePlugin) {
      const REAL_ESTATE = hre.ethers.id("REAL_ESTATE");
      const RealEstatePlugin = await hre.ethers.getContractFactory("RealEstatePlugin");
      const realEstatePluginInstance = await RealEstatePlugin.deploy({ gasPrice });
      await realEstatePluginInstance.waitForDeployment();
      deployed.realEstatePlugin = await realEstatePluginInstance.getAddress();
      console.log("  ✅ RealEstatePlugin:", deployed.realEstatePlugin);
      
      // Register plugin
      await (await assetFactory.registerPlugin(REAL_ESTATE, deployed.realEstatePlugin, { gasPrice })).wait();
      saveProgress();
    } else {
      console.log("  ℹ️ RealEstatePlugin already deployed at:", deployed.realEstatePlugin);
    }

    // --- 🔹 PHASE 3: FINANCIAL (L3) ---
    console.log("\n>>> [3/4] DEPLOYING LAYER 3 (FINANCIAL)...");

    let syncVaultTemplate;
    if (!deployed.syncVaultTemplate) {
      const SyncVault = await hre.ethers.getContractFactory("SyncVault");
      const syncVaultTemplateInstance = await SyncVault.deploy({ gasPrice }); 
      await syncVaultTemplateInstance.waitForDeployment();
      deployed.syncVaultTemplate = await syncVaultTemplateInstance.getAddress();
      console.log("  ✅ SyncVault Template:", deployed.syncVaultTemplate);
      saveProgress();
    } else {
      console.log("  ℹ️ SyncVault Template already deployed at:", deployed.syncVaultTemplate);
    }

    let vaultFactory;
    if (!deployed.vaultFactory) {
      const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
      const vaultFactoryInstance = await VaultFactory.deploy(deployer.address, { gasPrice }); 
      await vaultFactoryInstance.waitForDeployment();
      deployed.vaultFactory = await vaultFactoryInstance.getAddress();
      vaultFactory = vaultFactoryInstance;
      console.log("  ✅ VaultFactory:", deployed.vaultFactory);
      saveProgress();
    } else {
      vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployed.vaultFactory);
      console.log("  ℹ️ VaultFactory already deployed at:", deployed.vaultFactory);
    }

    let yieldDistributor;
    if (!deployed.yieldDistributor) {
      const YieldDistributor = await hre.ethers.getContractFactory("YieldDistributor");
      const yieldDistributorInstance = await YieldDistributor.deploy(deployer.address, { gasPrice }); 
      await yieldDistributorInstance.waitForDeployment();
      deployed.yieldDistributor = await yieldDistributorInstance.getAddress();
      yieldDistributor = yieldDistributorInstance;
      console.log("  ✅ YieldDistributor:", deployed.yieldDistributor);
      saveProgress();
    } else {
      yieldDistributor = await hre.ethers.getContractAt("YieldDistributor", deployed.yieldDistributor);
      console.log("  ℹ️ YieldDistributor already deployed at:", deployed.yieldDistributor);
    }

    let usdc;
    if (!deployed.usdc) {
      const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
      const mockUsdc = await MockERC20.deploy("USD Coin", "USDC", { gasPrice });
      await mockUsdc.waitForDeployment();
      deployed.usdc = await mockUsdc.getAddress();
      console.log("  ✅ MockUSDC:", deployed.usdc);
      saveProgress();
    } else {
      console.log("  ℹ️ MockUSDC already deployed at:", deployed.usdc);
    }

    let usdt;
    if (!deployed.usdt) {
      const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
      const mockUsdt = await MockERC20.deploy("Tether USD", "USDT", { gasPrice });
      await mockUsdt.waitForDeployment();
      deployed.usdt = await mockUsdt.getAddress();
      console.log("  ✅ MockUSDT:", deployed.usdt);
      saveProgress();
    } else {
      console.log("  ℹ️ MockUSDT already deployed at:", deployed.usdt);
    }

    let feeEngine;
    if (!deployed.feeEngine) {
      const FeeEngine = await hre.ethers.getContractFactory("FeeEngine");
      const feeEngineInstance = await hre.upgrades.deployProxy(
          FeeEngine,
          [deployer.address, deployed.usdc, deployer.address],
          { kind: "uups", txOverrides: { gasPrice } }
      );
      await feeEngineInstance.waitForDeployment();
      deployed.feeEngine = await feeEngineInstance.getAddress();
      feeEngine = feeEngineInstance;
      console.log("  ✅ FeeEngine:", deployed.feeEngine);
      saveProgress();
    } else {
      feeEngine = await hre.ethers.getContractAt("FeeEngine", deployed.feeEngine);
      console.log("  ℹ️ FeeEngine already deployed at:", deployed.feeEngine);
    }

    let navOracle;
    if (!deployed.navOracle) {
      const NAVOracle = await hre.ethers.getContractFactory("NAVOracle");
      const navOracleInstance = await hre.upgrades.deployProxy(
          NAVOracle,
          [deployed.feeEngine, deployer.address],
          { kind: "uups", txOverrides: { gasPrice } }
      );
      await navOracleInstance.waitForDeployment();
      deployed.navOracle = await navOracleInstance.getAddress();
      navOracle = navOracleInstance;
      console.log("  ✅ NAVOracle:", deployed.navOracle);
      saveProgress();

      // Configure layers
      console.log("  Configuring Financial Layer links...");
      await (await vaultFactory.setAssetFactory(deployed.assetFactory, { gasPrice })).wait();
      await (await vaultFactory.setSyncVaultTemplate(deployed.syncVaultTemplate, { gasPrice })).wait();
      await (await vaultFactory.setIdentityRegistry(deployed.identityRegistry, { gasPrice })).wait();
      await (await vaultFactory.setComplianceModule(deployed.complianceModule, { gasPrice })).wait();
      await (await vaultFactory.setCircuitBreakerModule(deployed.circuitBreaker, { gasPrice })).wait();
      await (await vaultFactory.setYieldDistributor(deployed.yieldDistributor, { gasPrice })).wait();
      
      const assetRegistryInstance = await hre.ethers.getContractAt("AssetRegistry", deployed.assetRegistry);
      await (await assetRegistryInstance.addOperator(deployed.vaultFactory, { gasPrice })).wait();
      console.log("  ✅ Financial Layer Configured");
      saveProgress();
    } else {
      navOracle = await hre.ethers.getContractAt("NAVOracle", deployed.navOracle);
      console.log("  ℹ️ NAVOracle already deployed at:", deployed.navOracle);
    }

    if (!deployed.financialConfigured) {
      // Configure layers
      console.log("  Configuring Financial Layer links...");
      await (await vaultFactory.setAssetFactory(deployed.assetFactory, { gasPrice })).wait();
      await (await vaultFactory.setSyncVaultTemplate(deployed.syncVaultTemplate, { gasPrice })).wait();
      await (await vaultFactory.setIdentityRegistry(deployed.identityRegistry, { gasPrice })).wait();
      await (await vaultFactory.setComplianceModule(deployed.complianceModule, { gasPrice })).wait();
      await (await vaultFactory.setCircuitBreakerModule(deployed.circuitBreaker, { gasPrice })).wait();
      await (await vaultFactory.setYieldDistributor(deployed.yieldDistributor, { gasPrice })).wait();
      
      const assetRegistryInstance = await hre.ethers.getContractAt("AssetRegistry", deployed.assetRegistry);
      await (await assetRegistryInstance.addOperator(deployed.vaultFactory, { gasPrice })).wait();
      console.log("  ✅ Financial Layer Configured");
      deployed.financialConfigured = true;
      saveProgress();
    } else {
      console.log("  ℹ️ Financial Layer already configured.");
    }

    // --- 🔹 PHASE 4: MARKETPLACE (L4) ---
    console.log("\n>>> [4/4] DEPLOYING LAYER 4 (MARKETPLACE)...");

    let marketplaceFactory;
    if (!deployed.marketplaceFactory) {
      const MarketplaceFactory = await hre.ethers.getContractFactory("MarketplaceFactory");
      const marketplaceFactoryInstance = await MarketplaceFactory.deploy({ gasPrice }); 
      await marketplaceFactoryInstance.waitForDeployment();
      deployed.marketplaceFactory = await marketplaceFactoryInstance.getAddress();
      console.log("  ✅ MarketplaceFactory:", deployed.marketplaceFactory);
      saveProgress();
    } else {
      console.log("  ℹ️ MarketplaceFactory already deployed at:", deployed.marketplaceFactory);
    }

    let orderBookEngine;
    if (!deployed.orderBookEngine) {
      const OrderBookEngine = await hre.ethers.getContractFactory("OrderBookEngine");
      const orderBookEngineInstance = await OrderBookEngine.deploy({ gasPrice });
      await orderBookEngineInstance.waitForDeployment();
      deployed.orderBookEngine = await orderBookEngineInstance.getAddress();
      console.log("  ✅ OrderBookEngine:", deployed.orderBookEngine);
      saveProgress();
    } else {
      console.log("  ℹ️ OrderBookEngine already deployed at:", deployed.orderBookEngine);
    }

    let settlementEngine;
    if (!deployed.settlementEngine) {
      const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
      const settlementEngineInstance = await SettlementEngine.deploy({ gasPrice });
      await settlementEngineInstance.waitForDeployment();
      deployed.settlementEngine = await settlementEngineInstance.getAddress();
      console.log("  ✅ SettlementEngine:", deployed.settlementEngine);
      saveProgress();
    } else {
      console.log("  ℹ️ SettlementEngine already deployed at:", deployed.settlementEngine);
    }

    let clearingHouse;
    if (!deployed.clearingHouse) {
      const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
      const clearingHouseInstance = await ClearingHouse.deploy({ gasPrice });
      await clearingHouseInstance.waitForDeployment();
      deployed.clearingHouse = await clearingHouseInstance.getAddress();
      console.log("  ✅ ClearingHouse:", deployed.clearingHouse);
      saveProgress();
    } else {
      console.log("  ℹ️ ClearingHouse already deployed at:", deployed.clearingHouse);
    }

    if (!deployed.marketplaceConfigured) {
      // Configure marketplace links
      console.log("  Configuring Marketplace Layer links...");
      const settlementEngineInstance = await hre.ethers.getContractAt("SettlementEngine", deployed.settlementEngine);
      await (await settlementEngineInstance.setComplianceConfig(deployed.identityRegistry, deployed.complianceModule, { gasPrice })).wait();
      await (await settlementEngineInstance.authorizeSettler(deployed.clearingHouse, { gasPrice })).wait();
      
      const clearingHouseInstanceContract = await hre.ethers.getContractAt("ClearingHouse", deployed.clearingHouse);
      await (await clearingHouseInstanceContract.setSettlementEngine(deployed.settlementEngine, { gasPrice })).wait();
      await (await clearingHouseInstanceContract.setIdentityRegistry(deployed.identityRegistry, { gasPrice })).wait();
      console.log("  ✅ Marketplace Layer Configured");
      deployed.marketplaceConfigured = true;
      saveProgress();
    } else {
      console.log("  ℹ️ Marketplace Layer already configured.");
    }

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
