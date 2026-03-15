const hre = require("hardhat");

/**
 * Script to add a new KYC Provider
 * Usage: npx hardhat run scripts/add-kyc-provider.js ---network <network>
 */

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: npx hardhat run scripts/add-kyc-provider.js --network <network> <providerAddress> <providerName>");
    process.exit(1);
  }

  const [providerAddress, providerName] = args;

  console.log("========================================");
  console.log("Adding KYC Provider");
  console.log("========================================");
  console.log("Provider Address:", providerAddress);
  console.log("Provider Name:", providerName);
  console.log();

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Executing with account:", deployer.address);

  // Load deployed contract addresses
  const network = hre.network.name;
  const deploymentFile = require(`../deployments/${network}-deployment.json`);
  const kycRegistryAddress = deploymentFile.contracts.kycRegistry;

  console.log("\nKYCProvidersRegistry:", kycRegistryAddress);

  // Get KYCProvidersRegistry contract
  const KYCProvidersRegistry = await hre.ethers.getContractFactory("KYCProvidersRegistry");
  const kycRegistry = KYCProvidersRegistry.attach(kycRegistryAddress);

  // Check if caller is owner
  const owner = await kycRegistry.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("Error: Caller is not the contract owner");
    console.log("Owner:", owner);
    process.exit(1);
  }

  // Check if provider already exists
  const providerInfo = await kycRegistry.getProviderInfo(providerAddress);
  if (providerInfo.status !== 0) {
    console.log("Error: Provider already registered with status:", providerInfo.status);
    process.exit(1);
  }

  // Register provider
  console.log("\nRegistering provider...");
  const registerTx = await kycRegistry.registerProvider(providerAddress, providerName);
  await registerTx.wait();
  console.log("✓ Provider registered");

  // Approve provider
  console.log("Approving provider...");
  const approveTx = await kycRegistry.approveProvider(providerAddress);
  await approveTx.wait();
  console.log("✓ Provider approved");

  // Verify provider status
  const isApproved = await kycRegistry.isProviderApproved(providerAddress);
  console.log("\nProvider Status:", isApproved ? "APPROVED" : "NOT APPROVED");

  console.log("\n✅ KYC Provider added successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
