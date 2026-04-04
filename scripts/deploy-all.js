const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * CRATS Protocol - Master Deployment Orchestration
 * 
 * Order:
 * 1. Layer 1 (Identity & Compliance)
 * 2. Layer 2 (Asset Tokenization)
 * 3. Layer 3 (Financial Abstraction)
 * 4. Layer 4 (Marketplace Infrastructure)
 */

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("   CRATS PROTOCOL - FULL SYSTEM DEPLOYMENT (v1.0)");
  console.log("=".repeat(80) + "\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Master Deployer:", deployer.address);
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("\nStarting Sequential Deployment...\n");

  const startTime = Date.now();

  try {
    // 1. Layer 1
    console.log(">>> [1/4] DEPLOYING LAYER 1 (IDENTITY)...");
    await hre.run("run", { script: "scripts/deploy-layer1.js", network: hre.network.name });
    console.log("--- Layer 1 Completed ---\n");

    // 2. Layer 2
    console.log(">>> [2/4] DEPLOYING LAYER 2 (TOKENIZATION)...");
    await hre.run("run", { script: "scripts/deploy-layer2.js", network: hre.network.name });
    console.log("--- Layer 2 Completed ---\n");

    // 3. Layer 3
    console.log(">>> [3/4] DEPLOYING LAYER 3 (FINANCIAL)...");
    await hre.run("run", { script: "scripts/deploy-layer3.js", network: hre.network.name });
    console.log("--- Layer 3 Completed ---\n");

    // 4. Layer 4
    console.log(">>> [4/4] DEPLOYING LAYER 4 (MARKETPLACE)...");
    await hre.run("run", { script: "scripts/deploy-layer4.js", network: hre.network.name });
    console.log("--- Layer 4 Completed ---\n");

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log("=".repeat(80));
    console.log(`🎉 SUCCESS: CRATS PROTOCOL FULLY DEPLOYED IN ${duration.toFixed(2)}s`);
    console.log("=".repeat(80));
    console.log("\nNext Steps:");
    console.log("  Run the workflow scripts in order from scripts/workflow/");
    console.log("  Example: npx hardhat run scripts/workflow/1.issuer_onboarding_identity_registry_L1.js --network localhost\n");

  } catch (error) {
    console.error("\n❌ FATAL ERROR IN MASTER DEPLOYMENT:");
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
