const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

/**
 * CRATS Protocol — FineArt Plugin + DisputeResolver + NAVScheduler Deploy
 *
 * Resumable: loads existing sepolia-deployment.json and skips already-deployed contracts.
 *
 * Steps:
 *  1. Deploy FineArtPlugin (if not deployed)
 *  2. Register FineArtPlugin in AssetFactory
 *  3. Deploy DisputeResolver proxy (if not deployed)
 *  4. Deploy NAVScheduler proxy (if not deployed)
 *  5. Grant RESOLVER_ROLE on NAVOracle to DisputeResolver
 *  6. Grant DEFAULT_ADMIN_ROLE on NAVOracle to NAVScheduler (for setAssetClassSchedule)
 *  7. Initialize default NAV schedules for all 4 asset classes
 *  8. Set NAVOracle.insuranceReserve = protocolTreasury (slash destination)
 *  9. Save addresses to sepolia-deployment.json
 *
 * Usage:
 *   npx hardhat run scripts/deploy-fineart-plugin.js --network sepolia
 */

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  CRATS — FineArt + DisputeResolver + NAVScheduler Deploy");
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
  const required = ["assetFactory", "navOracle", "feeEngine"];
  for (const key of required) {
    if (!deployed[key]) {
      throw new Error(
        `Missing ${key} in deployment file. Run deploy-master.js first.`
      );
    }
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
  console.log(
    `\nGas price: ${hre.ethers.formatUnits(gasPrice, "gwei")} Gwei\n`
  );

  // ── Attach existing contracts ───────────────────────────────
  const assetFactory = await hre.ethers.getContractAt(
    "AssetFactory", deployed.assetFactory
  );
  const navOracle = await hre.ethers.getContractAt(
    "NAVOracle", deployed.navOracle
  );

  // ════════════════════════════════════════════════════════════
  // STEP 1: Deploy FineArtPlugin
  // ════════════════════════════════════════════════════════════
  console.log(">>> [1/7] FineArtPlugin");

  if (!deployed.fineArtPlugin) {
    const FineArtPlugin = await hre.ethers.getContractFactory("FineArtPlugin");
    const fineArtPluginInstance = await FineArtPlugin.deploy({ gasPrice });
    await fineArtPluginInstance.waitForDeployment();
    deployed.fineArtPlugin = await fineArtPluginInstance.getAddress();
    console.log("  ✅ FineArtPlugin deployed:", deployed.fineArtPlugin);
    saveProgress();
  } else {
    console.log("  ℹ️  Already deployed:", deployed.fineArtPlugin);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 2: Register FineArtPlugin in AssetFactory
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [2/7] Register FineArtPlugin in AssetFactory");

  if (!deployed.fineArtPluginRegistered) {
    const FINE_ART = hre.ethers.id("FINE_ART");

    // Check if already registered (idempotent check)
    const existing = await assetFactory.plugins(FINE_ART);
    if (existing === hre.ethers.ZeroAddress) {
      const tx = await assetFactory.registerPlugin(
        FINE_ART, deployed.fineArtPlugin, { gasPrice }
      );
      await tx.wait();
      console.log("  ✅ FineArtPlugin registered for FINE_ART category");
    } else if (existing.toLowerCase() === deployed.fineArtPlugin.toLowerCase()) {
      console.log("  ℹ️  Already registered at:", existing);
    } else {
      console.log("  ⚠️  Different plugin registered:", existing, "— using upgradePlugin");
      const tx = await assetFactory.upgradePlugin(
        FINE_ART, deployed.fineArtPlugin, { gasPrice }
      );
      await tx.wait();
      console.log("  ✅ Plugin upgraded to:", deployed.fineArtPlugin);
    }

    deployed.fineArtPluginRegistered = true;
    saveProgress();
  } else {
    console.log("  ℹ️  Already registered (flag set)");
  }

  // ════════════════════════════════════════════════════════════
  // STEP 3: Deploy DisputeResolver
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [3/7] DisputeResolver");

  if (!deployed.disputeResolver) {
    const protocolTreasury = deployed.protocolTreasury || deployer.address;

    const DisputeResolver = await hre.ethers.getContractFactory("DisputeResolver");
    const drInstance = await hre.upgrades.deployProxy(
      DisputeResolver,
      [deployed.navOracle, protocolTreasury, deployer.address],
      { kind: "uups", txOverrides: { gasPrice } }
    );
    await drInstance.waitForDeployment();
    deployed.disputeResolver = await drInstance.getAddress();
    console.log("  ✅ DisputeResolver deployed:", deployed.disputeResolver);
    saveProgress();
  } else {
    console.log("  ℹ️  Already deployed:", deployed.disputeResolver);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 4: Deploy NAVScheduler
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [4/7] NAVScheduler (Chainlink Automation compatible)");

  if (!deployed.navScheduler) {
    const NAVScheduler = await hre.ethers.getContractFactory("NAVScheduler");
    const nsInstance = await hre.upgrades.deployProxy(
      NAVScheduler,
      [deployed.navOracle, deployer.address],
      { kind: "uups", txOverrides: { gasPrice } }
    );
    await nsInstance.waitForDeployment();
    deployed.navScheduler = await nsInstance.getAddress();
    console.log("  ✅ NAVScheduler deployed:", deployed.navScheduler);
    saveProgress();
  } else {
    console.log("  ℹ️  Already deployed:", deployed.navScheduler);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 5: Grant RESOLVER_ROLE on NAVOracle to DisputeResolver
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [5/7] Grant RESOLVER_ROLE → DisputeResolver");

  if (!deployed.resolverRoleGranted) {
    const RESOLVER_ROLE = await navOracle.RESOLVER_ROLE();
    const hasRole = await navOracle.hasRole(RESOLVER_ROLE, deployed.disputeResolver);

    if (!hasRole) {
      const tx = await navOracle.grantRole(
        RESOLVER_ROLE, deployed.disputeResolver, { gasPrice }
      );
      await tx.wait();
      console.log("  ✅ RESOLVER_ROLE granted to DisputeResolver");
    } else {
      console.log("  ℹ️  RESOLVER_ROLE already granted");
    }

    deployed.resolverRoleGranted = true;
    saveProgress();
  } else {
    console.log("  ℹ️  Already granted (flag set)");
  }

  // ════════════════════════════════════════════════════════════
  // STEP 6: Grant DEFAULT_ADMIN_ROLE on NAVOracle to NAVScheduler
  //         (so NAVScheduler.initializeDefaultSchedules() can call
  //          NAVOracle.setAssetClassSchedule())
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [6/7] Grant DEFAULT_ADMIN_ROLE → NAVScheduler (for schedule setup)");

  if (!deployed.schedulerAdminGranted) {
    const DEFAULT_ADMIN_ROLE = await navOracle.DEFAULT_ADMIN_ROLE();
    const hasRole = await navOracle.hasRole(DEFAULT_ADMIN_ROLE, deployed.navScheduler);

    if (!hasRole) {
      const tx = await navOracle.grantRole(
        DEFAULT_ADMIN_ROLE, deployed.navScheduler, { gasPrice }
      );
      await tx.wait();
      console.log("  ✅ DEFAULT_ADMIN_ROLE granted to NAVScheduler");
    } else {
      console.log("  ℹ️  DEFAULT_ADMIN_ROLE already granted");
    }

    deployed.schedulerAdminGranted = true;
    saveProgress();
  } else {
    console.log("  ℹ️  Already granted (flag set)");
  }

  // ════════════════════════════════════════════════════════════
  // STEP 7: Initialize Default NAV Schedules via NAVScheduler
  // ════════════════════════════════════════════════════════════
  console.log("\n>>> [7/7] Initialize NAV schedules (all 4 asset classes)");

  if (!deployed.navSchedulesInitialized) {
    const navScheduler = await hre.ethers.getContractAt(
      "NAVScheduler", deployed.navScheduler
    );

    const tx = await navScheduler.initializeDefaultSchedules({ gasPrice });
    await tx.wait();

    console.log("  ✅ Schedules initialized:");
    console.log("     REAL_ESTATE     → 90 days  (warn at 75d)");
    console.log("     CORPORATE_BOND  → 1 day    (warn at 1d)");
    console.log("     PRIVATE_CREDIT  → 30 days  (warn at 25d)");
    console.log("     FINE_ART        → 365 days (warn at 330d)");

    deployed.navSchedulesInitialized = true;
    saveProgress();
  } else {
    console.log("  ℹ️  Already initialized (flag set)");
  }

  // ── Final Summary ───────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("🎉 DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log("\nNew contracts:");
  console.log("  FineArtPlugin    :", deployed.fineArtPlugin);
  console.log("  DisputeResolver  :", deployed.disputeResolver);
  console.log("  NAVScheduler     :", deployed.navScheduler);

  console.log("\n📋 Next Steps for Chainlink Automation:");
  console.log("  1. Go to https://automation.chain.link");
  console.log("  2. Connect wallet (deployer)");
  console.log("  3. Register new Upkeep → Custom Logic");
  console.log("  4. Target contract:", deployed.navScheduler);
  console.log("  5. Fund upkeep with LINK on Sepolia");
  console.log("  6. Register asset IDs via navScheduler.registerAsset(bytes32 assetId)");
  console.log("\n📋 To set optional challenger reward (e.g. 100 USDC):");
  console.log(
    `  cast send ${deployed.disputeResolver} ` +
    '"setRewardAmount(uint256)" 100000000 --rpc-url $SEPOLIA_URL --private-key $PRIVATE_KEY'
  );
  console.log("\n💾 Deployment saved to:", deploymentFile);
}

main().catch((error) => {
  console.error("\n❌ Deploy failed:", error);
  process.exit(1);
});
