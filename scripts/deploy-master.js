const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * CRATS Protocol - Unified Master Deployment (v1.5)
 * 
 * Finalized constructors for all layers:
 * - L1: Proxies
 * - L2: Templates (0-args), Factory (Proxy)
 * - L3: SyncVault Template (4-args!), Factory (1-arg)
 * - L4: Base Contracts (0-args)
 */

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("   CRATS PROTOCOL - UNIFIED MASTER DEPLOYMENT (v1.5)");
  console.log("=".repeat(80) + "\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log("Master Deployer:", deployer.address);
  console.log("Network:", network);
  
  const deployed = {};

  try {
    // --- 🔹 PHASE 1: IDENTITY (L1) ---
    console.log("\n>>> [1/4] DEPLOYING LAYER 1 (IDENTITY)...");
    
    const KYCRegistry = await hre.ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await hre.upgrades.deployProxy(KYCRegistry, [deployer.address], { kind: "uups" });
    await kycRegistry.waitForDeployment();
    deployed.kycRegistry = await kycRegistry.getAddress();

    const IdentitySBT = await hre.ethers.getContractFactory("IdentitySBT");
    const identitySBT = await hre.upgrades.deployProxy(IdentitySBT, ["CRATS Identity", "CRATS-ID", deployer.address], { kind: "uups" });
    await identitySBT.waitForDeployment();
    deployed.identitySBT = await identitySBT.getAddress();

    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await hre.upgrades.deployProxy(IdentityRegistry, [deployer.address, deployed.identitySBT, deployed.kycRegistry], { kind: "uups" });
    await identityRegistry.waitForDeployment();
    deployed.identityRegistry = await identityRegistry.getAddress();

    // --- 🔹 CROSS-AUTHORIZE IDENTITY (L1) ---
    console.log(">>> AUTHORIZING IDENTITY REGISTRY IN SBT...");
    const IDENTITY_MANAGER_ROLE = hre.ethers.id("IDENTITY_MANAGER_ROLE");
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, deployed.identityRegistry);
    console.log("   ✅ Role Granted:", deployed.identityRegistry);

    const Compliance = await hre.ethers.getContractFactory("Compliance");
    const complianceModule = await hre.upgrades.deployProxy(Compliance, [deployer.address, deployed.identityRegistry], { kind: "uups" });
    await complianceModule.waitForDeployment();
    deployed.complianceModule = await complianceModule.getAddress();

    const TravelRuleModule = await hre.ethers.getContractFactory("TravelRuleModule");
    const travelRuleModule = await hre.upgrades.deployProxy(TravelRuleModule, [deployer.address, deployed.identityRegistry, hre.ethers.parseEther("1000")], { kind: "uups" });
    await travelRuleModule.waitForDeployment();
    deployed.travelRuleModule = await travelRuleModule.getAddress();

    const InvestorRightsRegistry = await hre.ethers.getContractFactory("InvestorRightsRegistry");
    const investorRightsRegistry = await hre.upgrades.deployProxy(InvestorRightsRegistry, [deployer.address, deployed.identityRegistry], { kind: "uups" });
    await investorRightsRegistry.waitForDeployment();
    deployed.investorRightsRegistry = await investorRightsRegistry.getAddress();

    // --- 🔹 AUTHORIZE PROVIDER (L1) ---
    console.log(">>> AUTHORIZING KYC PROVIDER...");
    await kycRegistry.registerProvider(deployer.address, "CRATS Admin Provider");
    await kycRegistry.approveProvider(deployer.address);
    console.log("   ✅ Provider Authorized:", deployer.address);

    // --- 🔹 PHASE 2: TOKENIZATION (L2) ---
    console.log(">>> [2/4] DEPLOYING LAYER 2 (TOKENIZATION)...");

    const CircuitBreakerModule = await hre.ethers.getContractFactory("contracts/asset/CircuitBreakerModule.sol:CircuitBreakerModule");
    const circuitBreaker = await hre.upgrades.deployProxy(CircuitBreakerModule, [deployer.address], { kind: "uups" });
    await circuitBreaker.waitForDeployment();
    deployed.circuitBreaker = await circuitBreaker.getAddress();

    const AssetToken = await hre.ethers.getContractFactory("AssetToken");
    const assetTokenImpl = await AssetToken.deploy(); 
    await assetTokenImpl.waitForDeployment();
    deployed.assetTokenTemplate = await assetTokenImpl.getAddress();

    const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
    const assetFactory = await hre.upgrades.deployProxy(
        AssetFactory, 
        [deployer.address, deployed.assetTokenTemplate, deployed.identityRegistry, deployed.complianceModule, deployed.circuitBreaker], 
        { kind: "uups" }
    );
    await assetFactory.waitForDeployment();
    deployed.assetFactory = await assetFactory.getAddress();

    await assetFactory.approveIssuer(deployer.address);
    const REAL_ESTATE = hre.ethers.id("REAL_ESTATE");
    const RealEstatePlugin = await hre.ethers.getContractFactory("RealEstatePlugin");
    const realEstatePlugin = await RealEstatePlugin.deploy();
    await realEstatePlugin.waitForDeployment();
    deployed.realEstatePlugin = await realEstatePlugin.getAddress();
    await assetFactory.registerPlugin(REAL_ESTATE, deployed.realEstatePlugin);

    // --- 🔹 PHASE 3: FINANCIAL (L3) ---
    console.log(">>> [3/4] DEPLOYING LAYER 3 (FINANCIAL)...");

    // SyncVault template (Clonable)
    const SyncVault = await hre.ethers.getContractFactory("SyncVault");
    const syncVaultTemplate = await SyncVault.deploy(); 
    await syncVaultTemplate.waitForDeployment();
    deployed.syncVaultTemplate = await syncVaultTemplate.getAddress();

    const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
    const vaultFactory = await VaultFactory.deploy(deployer.address); 
    await vaultFactory.waitForDeployment();
    deployed.vaultFactory = await vaultFactory.getAddress();

    const YieldDistributor = await hre.ethers.getContractFactory("YieldDistributor");
    const yieldDistributor = await YieldDistributor.deploy(deployer.address); 
    await yieldDistributor.waitForDeployment();
    deployed.yieldDistributor = await yieldDistributor.getAddress();

    await vaultFactory.setSyncVaultTemplate(deployed.syncVaultTemplate);
    await vaultFactory.setIdentityRegistry(deployed.identityRegistry);
    await vaultFactory.setComplianceModule(deployed.complianceModule);
    await vaultFactory.setCircuitBreakerModule(deployed.circuitBreaker);
    await vaultFactory.setYieldDistributor(deployed.yieldDistributor);
    await yieldDistributor.setVaultRegistry(deployed.vaultFactory);
    await yieldDistributor.setInvestorRightsRegistry(deployed.investorRightsRegistry);

    // --- 🔹 PHASE 4: MARKETPLACE (L4) ---
    console.log(">>> [4/4] DEPLOYING LAYER 4 (MARKETPLACE)...");

    const MarketplaceFactory = await hre.ethers.getContractFactory("MarketplaceFactory");
    const marketplaceFactory = await MarketplaceFactory.deploy(); 
    await marketplaceFactory.waitForDeployment();
    deployed.marketplaceFactory = await marketplaceFactory.getAddress();

    const OrderBookEngine = await hre.ethers.getContractFactory("OrderBookEngine");
    const orderBookTemplate = await OrderBookEngine.deploy(); 
    await orderBookTemplate.waitForDeployment();
    deployed.orderBookEngine = await orderBookTemplate.getAddress();

    const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
    const settlementEngine = await SettlementEngine.deploy();
    await settlementEngine.waitForDeployment();
    deployed.settlementEngine = await settlementEngine.getAddress();

    const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
    const clearingHouse = await ClearingHouse.deploy();
    await clearingHouse.waitForDeployment();
    deployed.clearingHouse = await clearingHouse.getAddress();

    const MatchingEngine = await hre.ethers.getContractFactory("MatchingEngine");
    const matchingEngine = await MatchingEngine.deploy();
    await matchingEngine.waitForDeployment();
    deployed.matchingEngine = await matchingEngine.getAddress();

    await settlementEngine.setComplianceConfig(deployed.identityRegistry, deployed.complianceModule);
    await settlementEngine.authorizeSettler(deployed.clearingHouse);
    await clearingHouse.setSettlementEngine(deployed.settlementEngine);
    await clearingHouse.setOrderBookEngine(deployed.orderBookEngine);
    await clearingHouse.setIdentityRegistry(deployed.identityRegistry);
    await matchingEngine.setOrderBook(deployed.orderBookEngine);

    // --- 🚀 FINAL SAVING ---
    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);
    const deploymentInfo = {
      network,
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: deployed
    };

    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("🎉 SUCCESS: CRATS PROTOCOL FULLY DEPLOYED AND REGISTERED!");
    console.log("💾 Registry Saved to:", deploymentFile);
    console.log("=".repeat(80) + "\n");

  } catch (error) {
    console.error("\n❌ MASTER DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  }
}

main();
