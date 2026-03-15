const hre = require("hardhat");

/**
 * CRATS Protocol Layer 1 Deployment Script (v3.0)
 *
 * Deployment Order:
 * 1. KYCProvidersRegistry (no dependencies)
 * 2. IdentitySBT (no dependencies)
 * 3. IdentityRegistry (depends on 1 & 2)
 * 4. ComplianceModule (depends on 3)
 * 5. TravelRuleModule (depends on 3 & 4) - NEW v3.0
 * 6. InvestorRightsRegistry (depends on 3) - NEW v3.0
 */

async function main() {
  console.log("========================================");
  console.log("CRATS Protocol Layer 1 v3.0 Deployment");
  console.log("========================================\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deployment configuration
  const config = {
    admin: deployer.address,
    initialKYCProvider: deployer.address,
    regulator: deployer.address,
    complianceManager: deployer.address,
    travelRuleThreshold: ethers.parseEther("1000"), // 1000 tokens threshold
  };

  // Store deployed contract addresses
  const deployedContracts = {};

  // === 1. Deploy KYCProvidersRegistry ===
  console.log("1. Deploying KYCProvidersRegistry...");
  const KYCProvidersRegistry = await hre.ethers.getContractFactory("KYCProvidersRegistry");
  const kycRegistry = await KYCProvidersRegistry.deploy();
  await kycRegistry.waitForDeployment();
  deployedContracts.kycRegistry = await kycRegistry.getAddress();
  console.log("   KYCProvidersRegistry deployed:", deployedContracts.kycRegistry);

  // === 2. Deploy IdentitySBT ===
  console.log("\n2. Deploying IdentitySBT...");
  const IdentitySBT = await hre.ethers.getContractFactory("IdentitySBT");
  const identitySBT = await IdentitySBT.deploy(
    config.admin,
    deployedContracts.kycRegistry
  );
  await identitySBT.waitForDeployment();
  deployedContracts.identitySBT = await identitySBT.getAddress();
  console.log("   IdentitySBT deployed:", deployedContracts.identitySBT);

  // === 3. Deploy IdentityRegistry ===
  console.log("\n3. Deploying IdentityRegistry...");
  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy(
    config.admin,
    deployedContracts.identitySBT,
    deployedContracts.kycRegistry
  );
  await identityRegistry.waitForDeployment();
  deployedContracts.identityRegistry = await identityRegistry.getAddress();
  console.log("   IdentityRegistry deployed:", deployedContracts.identityRegistry);

  // === 4. Deploy ComplianceModule ===
  console.log("\n4. Deploying ComplianceModule...");
  const ComplianceModule = await hre.ethers.getContractFactory("ComplianceModule");
  const complianceModule = await ComplianceModule.deploy(
    config.admin,
    deployedContracts.identityRegistry
  );
  await complianceModule.waitForDeployment();
  deployedContracts.complianceModule = await complianceModule.getAddress();
  console.log("   ComplianceModule deployed:", deployedContracts.complianceModule);

  // === 5. Deploy TravelRuleModule (NEW v3.0) ===
  console.log("\n5. Deploying TravelRuleModule (v3.0)...");
  const TravelRuleModule = await hre.ethers.getContractFactory("TravelRuleModule");
  const travelRuleModule = await TravelRuleModule.deploy(
    config.admin,
    deployedContracts.identityRegistry,
    deployedContracts.complianceModule,
    config.travelRuleThreshold
  );
  await travelRuleModule.waitForDeployment();
  deployedContracts.travelRuleModule = await travelRuleModule.getAddress();
  console.log("   TravelRuleModule deployed:", deployedContracts.travelRuleModule);

  // === 6. Deploy InvestorRightsRegistry (NEW v3.0) ===
  console.log("\n6. Deploying InvestorRightsRegistry (v3.0)...");
  const InvestorRightsRegistry = await hre.ethers.getContractFactory("InvestorRightsRegistry");
  const investorRightsRegistry = await InvestorRightsRegistry.deploy(
    config.admin,
    deployedContracts.identityRegistry
  );
  await investorRightsRegistry.waitForDeployment();
  deployedContracts.investorRightsRegistry = await investorRightsRegistry.getAddress();
  console.log("   InvestorRightsRegistry deployed:", deployedContracts.investorRightsRegistry);

  // === Post-Deployment Configuration ===
  console.log("\n========================================");
  console.log("Configuring Roles...");
  console.log("========================================");

  // Register and approve initial KYC provider
  console.log("\nRegistering initial KYC provider...");
  const registerTx = await kycRegistry.registerProvider(
    config.initialKYCProvider,
    "Initial KYC Provider"
  );
  await registerTx.wait();
  console.log("   KYC Provider registered");

  const approveTx = await kycRegistry.approveProvider(config.initialKYCProvider);
  await approveTx.wait();
  console.log("   KYC Provider approved");

  // Grant REGULATOR_ROLE
  console.log("\nGranting REGULATOR_ROLE...");
  const REGULATOR_ROLE = hre.ethers.id("REGULATOR_ROLE");
  const grantRegulatorTx = await identityRegistry.grantRole(
    REGULATOR_ROLE,
    config.regulator
  );
  await grantRegulatorTx.wait();
  console.log("   REGULATOR_ROLE granted to:", config.regulator);

  // Grant COMPLIANCE_MANAGER_ROLE
  console.log("\nGranting COMPLIANCE_MANAGER_ROLE...");
  const COMPLIANCE_MANAGER_ROLE = hre.ethers.id("COMPLIANCE_MANAGER_ROLE");
  const grantComplianceTx = await complianceModule.grantRole(
    COMPLIANCE_MANAGER_ROLE,
    config.complianceManager
  );
  await grantComplianceTx.wait();
  console.log("   COMPLIANCE_MANAGER_ROLE granted to:", config.complianceManager);

  // Grant ISSUER_ROLE to investor rights registry
  console.log("\nGranting ISSUER_ROLE to InvestorRightsRegistry...");
  const ISSUER_ROLE = hre.ethers.id("ISSUER_ROLE");
  const grantIssuerTx = await investorRightsRegistry.grantRole(
    ISSUER_ROLE,
    config.admin
  );
  await grantIssuerTx.wait();
  console.log("   ISSUER_ROLE granted to:", config.admin);

  // Grant REPORTER_ROLE to regulator for Travel Rule
  console.log("\nGranting REPORTER_ROLE to regulator...");
  const REPORTER_ROLE = hre.ethers.id("REPORTER_ROLE");
  const grantReporterTx = await travelRuleModule.grantRole(
    REPORTER_ROLE,
    config.regulator
  );
  await grantReporterTx.wait();
  console.log("   REPORTER_ROLE granted to:", config.regulator);

  // Configure default jurisdictions
  console.log("\nConfiguring default jurisdictions...");
  const jurisdictions = [
    840,  // US
    826,  // GB
    276,  // DE
    250,  // FR
    756,  // CH
    702,  // SG
    344,  // HK
    392,  // JP
    36,   // AU (note: stored as 36, not 036)
    124,  // CA
    784,  // AE
  ];
  const allowJurisdictionsTx = await complianceModule.allowJurisdictions(jurisdictions);
  await allowJurisdictionsTx.wait();
  console.log("   Default jurisdictions configured");

  // === Final Summary ===
  console.log("\n========================================");
  console.log("Deployment Complete! (v3.0)");
  console.log("========================================");
  console.log("Contract Addresses:");
  console.log("----------------------------------------");
  console.log("KYCProvidersRegistry:   ", deployedContracts.kycRegistry);
  console.log("IdentitySBT:            ", deployedContracts.identitySBT);
  console.log("IdentityRegistry:       ", deployedContracts.identityRegistry);
  console.log("ComplianceModule:       ", deployedContracts.complianceModule);
  console.log("TravelRuleModule:       ", deployedContracts.travelRuleModule, "(NEW v3.0)");
  console.log("InvestorRightsRegistry: ", deployedContracts.investorRightsRegistry, "(NEW v3.0)");
  console.log("========================================\n");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployedContracts,
  };

  const fs = require("fs");
  const path = require("path");
  
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const networkName = hre.network.name === "unknown" ? "localhost" : hre.network.name;
  const deploymentFile = path.join(deploymentsDir, `${networkName}-deployment.json`);
  
  fs.writeFileSync(
    deploymentFile,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("Deployment info saved to:", deploymentFile);

  // Verify contracts (if on public network)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

    console.log("\nVerifying contracts on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: deployedContracts.kycRegistry,
        constructorArguments: [],
      });
      console.log("KYCProvidersRegistry verified");
    } catch (e) {
      console.log("KYCProvidersRegistry verification skipped:", e.message);
    }

    try {
      await hre.run("verify:verify", {
        address: deployedContracts.identitySBT,
        constructorArguments: [config.admin, deployedContracts.kycRegistry],
      });
      console.log("IdentitySBT verified");
    } catch (e) {
      console.log("IdentitySBT verification skipped:", e.message);
    }

    try {
      await hre.run("verify:verify", {
        address: deployedContracts.identityRegistry,
        constructorArguments: [config.admin, deployedContracts.identitySBT, deployedContracts.kycRegistry],
      });
      console.log("IdentityRegistry verified");
    } catch (e) {
      console.log("IdentityRegistry verification skipped:", e.message);
    }

    try {
      await hre.run("verify:verify", {
        address: deployedContracts.complianceModule,
        constructorArguments: [config.admin, deployedContracts.identityRegistry],
      });
      console.log("ComplianceModule verified");
    } catch (e) {
      console.log("ComplianceModule verification skipped:", e.message);
    }
  }

  console.log("\n✅ Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
