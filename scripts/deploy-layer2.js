const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying CRATS Layer 2 - Asset Tokenization Infrastructure...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Load Layer 1 addresses from deployment file
  const deploymentFile = path.join(process.cwd(), "deployments", `${hre.network.name}-deployment.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}. Run Layer 1 first.`);
  }
  
  const deploymentInfoBase = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const L1 = deploymentInfoBase.contracts;

  console.log("\n📋 Layer 1 Dependencies:");
  console.log("  Identity Registry:", L1.identityRegistry);
  console.log("  Compliance Module:", L1.complianceModule);
  console.log("  Travel Rule Module:", L1.travelRuleModule);

  // ========== DEPLOY LAYER 2 CONTRACTS ==========

  // 1. Deploy CircuitBreakerModule
  console.log("\n1️⃣  Deploying CircuitBreakerModule...");
  const CircuitBreakerModule = await hre.ethers.getContractFactory("contracts/asset/CircuitBreakerModule.sol:CircuitBreakerModule");
  const circuitBreaker = await hre.upgrades.deployProxy(CircuitBreakerModule, [deployer.address], { kind: "uups" });
  await circuitBreaker.waitForDeployment();
  const circuitBreakerAddress = await circuitBreaker.getAddress();
  console.log("  ✅ CircuitBreakerModule:", circuitBreakerAddress);

  // 3. Deploy AssetToken Template
  console.log("\n3️⃣  Deploying AssetToken Template...");
  const AssetToken = await hre.ethers.getContractFactory("AssetToken");
  const assetTokenTemplate = await AssetToken.deploy();
  await assetTokenTemplate.waitForDeployment();
  const assetTokenTemplateAddress = await assetTokenTemplate.getAddress();
  console.log("  ✅ AssetToken Template:", assetTokenTemplateAddress);

  // 2. Deploy AssetFactory (UPGRADEABLE)
  console.log("\n2️⃣  Deploying AssetFactory...");
  const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
  const assetFactory = await hre.upgrades.deployProxy(
    AssetFactory,
    [
      deployer.address,
      assetTokenTemplateAddress,
      L1.identityRegistry,
      L1.complianceModule,
      circuitBreakerAddress
    ],
    { kind: "uups" }
  );
  await assetFactory.waitForDeployment();
  const assetFactoryAddress = await assetFactory.getAddress();
  console.log("  ✅ AssetFactory:", assetFactoryAddress);

  // 4. Deploy AssetOracle Template
  console.log("\n4️⃣  Deploying AssetOracle Template...");
  const AssetOracle = await hre.ethers.getContractFactory("AssetOracle");
  const assetOracleTemplate = await AssetOracle.deploy();
  await assetOracleTemplate.waitForDeployment();
  const assetOracleTemplateAddress = await assetOracleTemplate.getAddress();
  console.log("  ✅ AssetOracle Template:", assetOracleTemplateAddress);

  // 5. Deploy AssetRegistry (UPGRADEABLE - NEW v3.0 BOR Module)
  console.log("\n5️⃣  Deploying AssetRegistry Proxy...");
  const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await hre.upgrades.deployProxy(
    AssetRegistry,
    [deployer.address],
    { kind: "uups" }
  );
  await assetRegistry.waitForDeployment();
  const assetRegistryAddress = await assetRegistry.getAddress();
  console.log("  ✅ AssetRegistry Proxy:", assetRegistryAddress);

  // 6. Deploy Plugins
  console.log("\n6️⃣  Deploying Plugins...");
  const RealEstatePlugin = await hre.ethers.getContractFactory("RealEstatePlugin");
  const realEstatePlugin = await RealEstatePlugin.deploy();
  await realEstatePlugin.waitForDeployment();
  const realEstatePluginAddress = await realEstatePlugin.getAddress();

  const FineArtPlugin = await hre.ethers.getContractFactory("FineArtPlugin");
  const fineArtPlugin = await FineArtPlugin.deploy();
  await fineArtPlugin.waitForDeployment();
  const fineArtPluginAddress = await fineArtPlugin.getAddress();

  const CarbonCreditPlugin = await hre.ethers.getContractFactory("CarbonCreditPlugin");
  const carbonCreditPlugin = await CarbonCreditPlugin.deploy();
  await carbonCreditPlugin.waitForDeployment();
  const carbonCreditPluginAddress = await carbonCreditPlugin.getAddress();

  // ========== CONFIGURATION ==========
  const REAL_ESTATE = hre.ethers.id("REAL_ESTATE");
  await assetFactory.registerPlugin(REAL_ESTATE, realEstatePluginAddress);
  
  const FINE_ART = hre.ethers.id("FINE_ART");
  await assetFactory.registerPlugin(FINE_ART, fineArtPluginAddress);
  
  const CARBON_CREDIT = hre.ethers.id("CARBON_CREDIT");
  await assetFactory.registerPlugin(CARBON_CREDIT, carbonCreditPluginAddress);
  
  const OPERATOR_ROLE = hre.ethers.id("OPERATOR_ROLE");
  await assetFactory.grantRole(OPERATOR_ROLE, deployer.address);
  await circuitBreaker.grantRole(OPERATOR_ROLE, deployer.address);
  
  // Link AssetRegistry to AssetFactory
  console.log("\n🔗 Linking AssetRegistry to AssetFactory...");
  await assetFactory.setAssetRegistry(assetRegistryAddress);
  await assetRegistry.addOperator(assetFactoryAddress); // Allow factory to register vaults
  console.log("  ✅ Link Complete");

  // ========== PERSISTENCE ==========
  let deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  deploymentInfo.contracts.circuitBreaker = circuitBreakerAddress;
  deploymentInfo.contracts.assetFactory = assetFactoryAddress;
  deploymentInfo.contracts.assetTokenTemplate = assetTokenTemplateAddress;
  deploymentInfo.contracts.assetOracleTemplate = assetOracleTemplateAddress;
  deploymentInfo.contracts.assetRegistry = assetRegistryAddress; // Updated
  deploymentInfo.contracts.realEstatePlugin = realEstatePluginAddress;
  deploymentInfo.contracts.fineArtPlugin = fineArtPluginAddress;
  deploymentInfo.contracts.carbonCreditPlugin = carbonCreditPluginAddress;

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info updated in:", deploymentFile);
  console.log("🎉 LAYER 2 DEPLOYMENT COMPLETE!");
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
