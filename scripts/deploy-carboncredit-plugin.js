const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

/**
 * CRATS Protocol — CarbonCreditPlugin Deploy & Registration Script
 *
 * Steps:
 *  1. Deploy CarbonCreditPlugin
 *  2. Register CarbonCreditPlugin in AssetFactory for CARBON_CREDIT category
 *  3. Save addresses to sepolia-deployment.json
 *
 * Usage:
 *   npx hardhat run scripts/deploy-carboncredit-plugin.js --network sepolia
 */

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  CRATS — CarbonCreditPlugin Deploy & Registration");
  console.log("=".repeat(70) + "\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log("Deployer :", deployer.address);
  console.log("Network  :", network);

  // ── Load existing deployment ────────────────────────────────
  const deploymentFile = path.join(
    process.cwd(), "deployments", `${network}-deployment.json`
  );

  let deployed = {};
  if (fs.existsSync(deploymentFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
      if (data.contracts) {
        deployed = data.contracts;
        console.log(`\nLoaded existing deployment from ${path.basename(deploymentFile)}`);
      }
    } catch (e) {
      console.log("Warning: could not parse deployment file — starting fresh.");
    }
  }

  // Verify required base contracts exist
  if (!deployed.assetFactory) {
    throw new Error("Missing assetFactory in deployment file. Run deploy-master.js first.");
  }

  const saveProgress = () => {
    const info = {
      network,
      chainId: hre.network.config.chainId?.toString() || "11155111",
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: deployed,
    };
    fs.writeFileSync(deploymentFile, JSON.stringify(info, null, 2));
    console.log(`  💾 Saved to ${path.basename(deploymentFile)}`);
  };

  // ── Gas price helper ────────────────────────────────────────
  const feeData = await hre.ethers.provider.getFeeData();
  let gasPrice = feeData.gasPrice;
  if (gasPrice) {
    gasPrice = (gasPrice * 130n) / 100n; // 30% buffer
  } else {
    gasPrice = hre.ethers.parseUnits("30", "gwei");
  }
  console.log(`\nGas price: ${hre.ethers.formatUnits(gasPrice, "gwei")} Gwei\n`);

  // ── Attach existing contracts ───────────────────────────────
  const assetFactory = await hre.ethers.getContractAt(
    "AssetFactory", deployed.assetFactory
  );

  // ════════════════════════════════════════════════════════════
  // STEP 1: Deploy CarbonCreditPlugin
  // ════════════════════════════════════════════════════════════
  console.log(">>> [1/2] CarbonCreditPlugin");

  if (!deployed.carbonCreditPlugin) {
    const CarbonCreditPlugin = await hre.ethers.getContractFactory("CarbonCreditPlugin");
    const pluginInstance = await CarbonCreditPlugin.deploy({ gasPrice });
    await pluginInstance.waitForDeployment();
    deployed.carbonCreditPlugin = await pluginInstance.getAddress();
    console.log("  ✅ CarbonCreditPlugin deployed:", deployed.carbonCreditPlugin);
    saveProgress();
  } else {
    console.log("  ℹ️  Already deployed:", deployed.carbonCreditPlugin);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 2: Register CarbonCreditPlugin in AssetFactory
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [2/2] Register CarbonCreditPlugin in AssetFactory");

  if (!deployed.carbonCreditPluginRegistered) {
    const CARBON_CREDIT = hre.ethers.id("CARBON_CREDIT");

    // Check if already registered (idempotent check)
    const existing = await assetFactory.plugins(CARBON_CREDIT);
    if (existing === hre.ethers.ZeroAddress) {
      const tx = await assetFactory.registerPlugin(
        CARBON_CREDIT, deployed.carbonCreditPlugin, { gasPrice }
      );
      await tx.wait();
      console.log("  ✅ CarbonCreditPlugin registered for CARBON_CREDIT category");
    } else if (existing.toLowerCase() === deployed.carbonCreditPlugin.toLowerCase()) {
      console.log("  ℹ️  Already registered at:", existing);
    } else {
      console.log("  ⚠️  Different plugin registered:", existing, "— upgrading plugin");
      const tx = await assetFactory.upgradePlugin(
        CARBON_CREDIT, deployed.carbonCreditPlugin, { gasPrice }
      );
      await tx.wait();
      console.log("  ✅ Plugin upgraded to:", deployed.carbonCreditPlugin);
    }

    deployed.carbonCreditPluginRegistered = true;
    saveProgress();
  } else {
    console.log("  ℹ️  Already registered (flag set)");
  }

  // ── Final Summary ───────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("🎉 DEPLOYMENT & REGISTRATION COMPLETE");
  console.log("=".repeat(70));
  console.log("\nNew contracts:");
  console.log("  CarbonCreditPlugin :", deployed.carbonCreditPlugin);
  console.log("\n💾 Deployment saved to:", deploymentFile);
}

main().catch((error) => {
  console.error("\n❌ Deploy failed:", error);
  process.exit(1);
});
