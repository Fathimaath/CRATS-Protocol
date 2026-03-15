const hre = require("hardhat");

/**
 * Script to configure compliance rules
 * Usage: npx hardhat run scripts/configure-compliance.js ---network <network>
 */

async function main() {
  console.log("========================================");
  console.log("Configuring Compliance Rules");
  console.log("========================================\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Executing with account:", deployer.address);

  // Load deployed contract addresses
  const network = hre.network.name;
  const deploymentFile = require(`../deployments/${network}-deployment.json`);
  const complianceModuleAddress = deploymentFile.contracts.complianceModule;
  const identityRegistryAddress = deploymentFile.contracts.identityRegistry;

  console.log("\nComplianceModule:", complianceModuleAddress);

  // Get ComplianceModule contract
  const ComplianceModule = await hre.ethers.getContractFactory("ComplianceModule");
  const complianceModule = ComplianceModule.attach(complianceModuleAddress);

  // Check if caller has COMPLIANCE_MANAGER_ROLE
  const COMPLIANCE_MANAGER_ROLE = hre.ethers.id("COMPLIANCE_MANAGER_ROLE");
  const hasRole = await complianceModule.hasRole(COMPLIANCE_MANAGER_ROLE, deployer.address);
  
  if (!hasRole) {
    console.log("Error: Caller does not have COMPLIANCE_MANAGER_ROLE");
    process.exit(1);
  }

  console.log("✓ Caller has COMPLIANCE_MANAGER_ROLE\n");

  // === Configure Holding Limits ===
  console.log("Configuring Holding Limits...");
  
  const holdingLimits = [
    { role: 0, limit: 0, name: "None" },
    { role: 1, limit: hre.ethers.parseUnits("10000", 18), name: "Investor" },
    { role: 2, limit: hre.ethers.parseUnits("100000", 18), name: "Qualified" },
    { role: 3, limit: hre.ethers.parseUnits("1000000", 18), name: "Institutional" },
    { role: 4, limit: hre.ethers.parseEther("1000000000"), name: "Issuer" },
  ];

  for (const limit of holdingLimits) {
    const tx = await complianceModule.setHoldingLimit(limit.role, limit.limit);
    await tx.wait();
    console.log(`  ${limit.name}: ${hre.ethers.formatUnits(limit.limit, 18)} tokens`);
  }

  // === Configure Daily Transfer Limits ===
  console.log("\nConfiguring Daily Transfer Limits...");
  
  const dailyLimits = [
    { role: 0, limit: 0, name: "None" },
    { role: 1, limit: hre.ethers.parseUnits("1000", 18), name: "Investor" },
    { role: 2, limit: hre.ethers.parseUnits("10000", 18), name: "Qualified" },
    { role: 3, limit: hre.ethers.parseUnits("100000", 18), name: "Institutional" },
    { role: 4, limit: hre.ethers.parseEther("1000000000"), name: "Issuer" },
  ];

  for (const limit of dailyLimits) {
    const tx = await complianceModule.setDailyLimit(limit.role, limit.limit);
    await tx.wait();
    console.log(`  ${limit.name}: ${hre.ethers.formatUnits(limit.limit, 18)} tokens/day`);
  }

  // === Configure Max Investors ===
  console.log("\nConfiguring Max Investors...");
  const maxInvestors = 100000;
  const tx = await complianceModule.setMaxInvestors(maxInvestors);
  await tx.wait();
  console.log(`  Max Investors: ${maxInvestors}`);

  // === Configure Jurisdictions ===
  console.log("\nConfiguring Jurisdictions...");
  
  // Allow additional jurisdictions
  const allowJurisdictions = [
    { code: 528, name: "Netherlands" },
    { code: 752, name: "Sweden" },
    { code: 578, name: "Norway" },
    { code: 208, name: "Denmark" },
    { code: 246, name: "Finland" },
  ];

  const jurisdictionCodes = allowJurisdictions.map(j => j.code);
  const allowTx = await complianceModule.allowJurisdictions(jurisdictionCodes);
  await allowTx.wait();
  
  for (const j of allowJurisdictions) {
    console.log(`  ✓ ${j.name} (${j.code}) - ALLOWED`);
  }

  // Block restricted jurisdictions (should already be blocked by default)
  const blockJurisdictions = [
    { code: 408, name: "North Korea" },
    { code: 364, name: "Iran" },
    { code: 760, name: "Syria" },
    { code: 192, name: "Cuba" },
  ];

  const blockTx = await complianceModule.blockJurisdictions(blockJurisdictions.map(j => j.code));
  await blockTx.wait();
  
  for (const j of blockJurisdictions) {
    console.log(`  ✗ ${j.name} (${j.code}) - BLOCKED`);
  }

  // === Verify Configuration ===
  console.log("\n========================================");
  console.log("Verifying Configuration...");
  console.log("========================================");

  const isEnabled = await complianceModule.isEnabled();
  console.log("Compliance Enabled:", isEnabled);

  const investorCount = await complianceModule.getInvestorCount();
  console.log("Current Investor Count:", investorCount);

  const maxInvestorsConfigured = await complianceModule.getMaxInvestors();
  console.log("Max Investors:", maxInvestorsConfigured.toString());

  console.log("\n✅ Compliance configuration completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
