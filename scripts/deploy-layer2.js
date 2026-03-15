const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying CRATS Layer 2 - Asset Tokenization Infrastructure...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Get Layer 1 contract addresses from environment or config
  const LAYER1_ADDRESSES = {
    identityRegistry: process.env.IDENTITY_REGISTRY_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    complianceModule: process.env.COMPLIANCE_MODULE_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    travelRuleModule: process.env.TRAVEL_RULE_MODULE_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
  };

  console.log("\n📋 Layer 1 Dependencies:");
  console.log("  Identity Registry:", LAYER1_ADDRESSES.identityRegistry);
  console.log("  Compliance Module:", LAYER1_ADDRESSES.complianceModule);
  console.log("  Travel Rule Module:", LAYER1_ADDRESSES.travelRuleModule);

  // ========== DEPLOY LAYER 2 CONTRACTS ==========

  // 1. Deploy CircuitBreakerModule
  console.log("\n1️⃣  Deploying CircuitBreakerModule...");
  const CircuitBreakerModule = await hre.ethers.getContractFactory("CircuitBreakerModule");
  const circuitBreaker = await CircuitBreakerModule.deploy(deployer.address);
  await circuitBreaker.waitForDeployment();
  const circuitBreakerAddress = await circuitBreaker.getAddress();
  console.log("  ✅ CircuitBreakerModule:", circuitBreakerAddress);

  // 2. Deploy AssetFactory
  console.log("\n2️⃣  Deploying AssetFactory...");
  const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
  const assetFactory = await AssetFactory.deploy(deployer.address);
  await assetFactory.waitForDeployment();
  const assetFactoryAddress = await assetFactory.getAddress();
  console.log("  ✅ AssetFactory:", assetFactoryAddress);

  // 3. Deploy AssetToken Template
  console.log("\n3️⃣  Deploying AssetToken Template...");
  const AssetToken = await hre.ethers.getContractFactory("AssetToken");
  const assetTokenTemplate = await AssetToken.deploy("CRATS Asset Token", "CAT", deployer.address);
  await assetTokenTemplate.waitForDeployment();
  const assetTokenTemplateAddress = await assetTokenTemplate.getAddress();
  console.log("  ✅ AssetToken Template:", assetTokenTemplateAddress);

  // 4. Deploy AssetOracle Template
  console.log("\n4️⃣  Deploying AssetOracle Template...");
  const AssetOracle = await hre.ethers.getContractFactory("AssetOracle");
  const assetOracleTemplate = await AssetOracle.deploy(deployer.address);
  await assetOracleTemplate.waitForDeployment();
  const assetOracleTemplateAddress = await assetOracleTemplate.getAddress();
  console.log("  ✅ AssetOracle Template:", assetOracleTemplateAddress);

  // 5. Deploy AssetRegistry Template
  console.log("\n5️⃣  Deploying AssetRegistry Template...");
  const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
  const assetRegistryTemplate = await AssetRegistry.deploy(deployer.address);
  await assetRegistryTemplate.waitForDeployment();
  const assetRegistryTemplateAddress = await assetRegistryTemplate.getAddress();
  console.log("  ✅ AssetRegistry Template:", assetRegistryTemplateAddress);

  // 6. Deploy Plugins
  console.log("\n6️⃣  Deploying Plugins...");
  
  const RealEstatePlugin = await hre.ethers.getContractFactory("RealEstatePlugin");
  const realEstatePlugin = await RealEstatePlugin.deploy();
  await realEstatePlugin.waitForDeployment();
  const realEstatePluginAddress = await realEstatePlugin.getAddress();
  console.log("  ✅ RealEstatePlugin:", realEstatePluginAddress);

  const FineArtPlugin = await hre.ethers.getContractFactory("FineArtPlugin");
  const fineArtPlugin = await FineArtPlugin.deploy();
  await fineArtPlugin.waitForDeployment();
  const fineArtPluginAddress = await fineArtPlugin.getAddress();
  console.log("  ✅ FineArtPlugin:", fineArtPluginAddress);

  const CarbonCreditPlugin = await hre.ethers.getContractFactory("CarbonCreditPlugin");
  const carbonCreditPlugin = await CarbonCreditPlugin.deploy();
  await carbonCreditPlugin.waitForDeployment();
  const carbonCreditPluginAddress = await carbonCreditPlugin.getAddress();
  console.log("  ✅ CarbonCreditPlugin:", carbonCreditPluginAddress);

  // ========== CONFIGURE CONTRACTS ==========

  console.log("\n🔧 Configuring contracts...\n");

  // Configure AssetFactory with Layer 1 dependencies
  console.log("  Setting Layer 1 dependencies...");
  await assetFactory.setIdentityRegistry(LAYER1_ADDRESSES.identityRegistry);
  await assetFactory.setComplianceModule(LAYER1_ADDRESSES.complianceModule);
  await assetFactory.setCircuitBreakerModule(circuitBreakerAddress);
  console.log("    ✅ Identity Registry configured");
  console.log("    ✅ Compliance Module configured");
  console.log("    ✅ Circuit Breaker configured");

  // Set templates in AssetFactory
  console.log("\n  Setting contract templates...");
  await assetFactory.setTemplates(
    assetTokenTemplateAddress,
    assetOracleTemplateAddress,
    assetRegistryTemplateAddress
  );
  console.log("    ✅ AssetToken template set");
  console.log("    ✅ AssetOracle template set");
  console.log("    ✅ AssetRegistry template set");

  // Register plugins
  console.log("\n  Registering plugins...");
  const REAL_ESTATE = hre.ethers.id("REAL_ESTATE");
  const FINE_ART = hre.ethers.id("FINE_ART");
  const CARBON_CREDIT = hre.ethers.id("CARBON_CREDIT");

  await assetFactory.registerPlugin(REAL_ESTATE, realEstatePluginAddress);
  console.log("    ✅ RealEstatePlugin registered");

  await assetFactory.registerPlugin(FINE_ART, fineArtPluginAddress);
  console.log("    ✅ FineArtPlugin registered");

  await assetFactory.registerPlugin(CARBON_CREDIT, carbonCreditPluginAddress);
  console.log("    ✅ CarbonCreditPlugin registered");

  // Grant roles
  console.log("\n  Configuring roles...");
  const OPERATOR_ROLE = hre.ethers.id("OPERATOR_ROLE");
  await assetFactory.grantRole(OPERATOR_ROLE, deployer.address);
  await circuitBreaker.grantRole(OPERATOR_ROLE, deployer.address);
  console.log("    ✅ OPERATOR_ROLE granted to deployer");

  // ========== FINAL SUMMARY ==========

  console.log("\n" + "=".repeat(70));
  console.log("🎉 LAYER 2 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(70));

  console.log("\n📦 CORE CONTRACTS:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │ CircuitBreakerModule:  ", circuitBreakerAddress.padEnd(40) + "│");
  console.log("  │ AssetFactory:          ", assetFactoryAddress.padEnd(40) + "│");
  console.log("  │ AssetToken Template:   ", assetTokenTemplateAddress.padEnd(40) + "│");
  console.log("  │ AssetOracle Template:  ", assetOracleTemplateAddress.padEnd(40) + "│");
  console.log("  │ AssetRegistry Template:", assetRegistryTemplateAddress.padEnd(40) + "│");
  console.log("  └─────────────────────────────────────────────────────────────┘");

  console.log("\n🔌 PLUGINS:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │ RealEstatePlugin:    ", realEstatePluginAddress.padEnd(40) + "│");
  console.log("  │ FineArtPlugin:       ", fineArtPluginAddress.padEnd(40) + "│");
  console.log("  │ CarbonCreditPlugin:  ", carbonCreditPluginAddress.padEnd(40) + "│");
  console.log("  └─────────────────────────────────────────────────────────────┘");

  console.log("\n🔗 LAYER 1 DEPENDENCIES:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │ IdentityRegistry:    ", LAYER1_ADDRESSES.identityRegistry.padEnd(40) + "│");
  console.log("  │ ComplianceModule:    ", LAYER1_ADDRESSES.complianceModule.padEnd(40) + "│");
  console.log("  │ TravelRuleModule:    ", LAYER1_ADDRESSES.travelRuleModule.padEnd(40) + "│");
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
    layer2: {
      circuitBreaker: circuitBreakerAddress,
      assetFactory: assetFactoryAddress,
      templates: {
        assetToken: assetTokenTemplateAddress,
        assetOracle: assetOracleTemplateAddress,
        assetRegistry: assetRegistryTemplateAddress
      },
      plugins: {
        realEstate: realEstatePluginAddress,
        fineArt: fineArtPluginAddress,
        carbonCredit: carbonCreditPluginAddress
      }
    }
  };

  const fs = require("fs");
  const path = require("path");
  
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const fileName = `layer2-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, fileName),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾 Deployment info saved to: deployments/" + fileName);
  console.log("\n📝 Next steps:");
  console.log("  1. Verify contracts on Etherscan (if mainnet/testnet)");
  console.log("  2. Approve issuers: await assetFactory.approveIssuer(issuerAddress)");
  console.log("  3. Create asset: await assetFactory.submitCreationRequest(...)");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
