const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log("🚀 Deploying CRATS Layer 4 - Marketplace Infrastructure...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Load existing deployment info
  const deploymentFile = path.join(process.cwd(), "deployments", `${hre.network.name}-deployment.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}. Run Layer 1 first.`);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const L1 = deploymentInfo.contracts;

  // ========== DEPLOY LAYER 4 CONTRACTS ==========

  // 1. Deploy MarketplaceFactory
  console.log("\n1️⃣  Deploying MarketplaceFactory...");
  const MarketplaceFactory = await hre.ethers.getContractFactory("MarketplaceFactory");
  const marketplaceFactory = await MarketplaceFactory.deploy();
  await marketplaceFactory.waitForDeployment();
  const marketplaceFactoryAddress = await marketplaceFactory.getAddress();
  console.log("  ✅ MarketplaceFactory:", marketplaceFactoryAddress);

  await sleep(15000);

  // 2. Deploy OrderBookEngine (Template)
  console.log("\n2️⃣  Deploying OrderBookEngine Template...");
  const OrderBookEngine = await hre.ethers.getContractFactory("OrderBookEngine");
  const orderBookTemplate = await OrderBookEngine.deploy();
  await orderBookTemplate.waitForDeployment();
  const orderBookTemplateAddress = await orderBookTemplate.getAddress();
  console.log("  ✅ OrderBookEngine Template:", orderBookTemplateAddress);

  await sleep(15000);

  // 3. Deploy SettlementEngine
  console.log("\n3️⃣  Deploying SettlementEngine...");
  const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await SettlementEngine.deploy();
  await settlementEngine.waitForDeployment();
  const settlementEngineAddress = await settlementEngine.getAddress();
  console.log("  ✅ SettlementEngine:", settlementEngineAddress);

  await sleep(15000);

  // 4. Deploy ClearingHouse
  console.log("\n4️⃣  Deploying ClearingHouse...");
  const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
  const clearingHouse = await ClearingHouse.deploy();
  await clearingHouse.waitForDeployment();
  const clearingHouseAddress = await clearingHouse.getAddress();
  console.log("  ✅ ClearingHouse:", clearingHouseAddress);

  await sleep(15000);

  // 5. Deploy MatchingEngine
  console.log("\n5️⃣  Deploying MatchingEngine...");
  const MatchingEngine = await hre.ethers.getContractFactory("MatchingEngine");
  const matchingEngine = await MatchingEngine.deploy();
  await matchingEngine.waitForDeployment();
  const matchingEngineAddress = await matchingEngine.getAddress();
  console.log("  ✅ MatchingEngine:", matchingEngineAddress);

  await sleep(15000);

  // ========== CONFIGURATION ==========
  console.log("🔧 Configuring Marketplace components...");
  
  if (L1.identityRegistry && L1.complianceModule) {
    await settlementEngine.setComplianceConfig(L1.identityRegistry, L1.complianceModule);
    await sleep(5000);
  }
  await settlementEngine.authorizeSettler(clearingHouseAddress);
  await sleep(5000);
  
  await clearingHouse.setSettlementEngine(settlementEngineAddress);
  await sleep(5000);
  await clearingHouse.setOrderBookEngine(orderBookTemplateAddress);
  await sleep(5000);
  if (L1.identityRegistry) await clearingHouse.setIdentityRegistry(L1.identityRegistry);
  await sleep(5000);
  
  await matchingEngine.setOrderBook(orderBookTemplateAddress);

  // ========== PERSISTENCE ==========
  let finalDeploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  finalDeploymentInfo.contracts.marketplaceFactory = marketplaceFactoryAddress;
  finalDeploymentInfo.contracts.orderBookEngine = orderBookTemplateAddress;
  finalDeploymentInfo.contracts.settlementEngine = settlementEngineAddress;
  finalDeploymentInfo.contracts.clearingHouse = clearingHouseAddress;
  finalDeploymentInfo.contracts.matchingEngine = matchingEngineAddress;

  fs.writeFileSync(deploymentFile, JSON.stringify(finalDeploymentInfo, null, 2));
  console.log("\n💾 Deployment info updated in:", deploymentFile);
  console.log("🎉 LAYER 4 DEPLOYMENT COMPLETE!");
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
