const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log("\nDeployer:", deployer.address);
  console.log("Network:", network, "\n");

  const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);
  const existing = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const deployed = { ...existing.contracts };

  const save = () => {
    existing.contracts = deployed;
    existing.timestamp = new Date().toISOString();
    fs.writeFileSync(deploymentFile, JSON.stringify(existing, null, 2));
    console.log("  Saved to", path.basename(deploymentFile));
  };

  // Dynamically fetch gas price from provider with a safety buffer
  const feeData = await hre.ethers.provider.getFeeData();
  let gasPrice = feeData.gasPrice;
  if (gasPrice) {
      gasPrice = (gasPrice * 130n) / 100n; // 30% buffer
  } else {
      gasPrice = hre.ethers.parseUnits("30", "gwei"); // Fallback
  }
  console.log(`Using gasPrice: ${hre.ethers.formatUnits(gasPrice, "gwei")} Gwei`);
  const txOverrides = { gasPrice };

  // ── 0. RESOLVE USDC and Timelock ───────────────────────────
  let usdcAddress = deployed.usdc;
  let timelockAddress = deployed.timelock;

  if (!usdcAddress || !timelockAddress) {
    if (!usdcAddress) {
      if (network === "hardhat" || network === "localhost") {
        console.log("\n>>> Deploying Mock USDC for local network...");
        const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("Mock USDC", "USDC", txOverrides);
        await usdc.waitForDeployment();
        usdcAddress = await usdc.getAddress();
        deployed.usdc = usdcAddress;
        console.log("  Mock USDC:", usdcAddress);
      } else {
        usdcAddress = process.env.USDC_ADDRESS;
        if (!usdcAddress) {
          throw new Error("Production-ready deployment requires USDC address. Please set USDC_ADDRESS.");
        }
        deployed.usdc = usdcAddress;
      }
    }
    if (!timelockAddress) {
      timelockAddress = process.env.TIMELOCK_ADDRESS;
      if (!timelockAddress) {
        console.log("\n>>> Deploying Mock Timelock...");
        const MockTimelock = await hre.ethers.getContractFactory("MockTimelock");
        const timelock = await MockTimelock.deploy(
          0, // minDelay
          [deployer.address], // proposers
          [deployer.address], // executors
          deployer.address, // admin
          txOverrides
        );
        await timelock.waitForDeployment();
        timelockAddress = await timelock.getAddress();
        console.log("  Mock Timelock:", timelockAddress);
      }
      deployed.timelock = timelockAddress;
    }
    save();
  }

  let currentStep = existing.v6Step || 0;
  console.log("Resuming from step:", currentStep);

  // ── 1. NEW: FeeEngine ──────────────────────────────────────
  if (currentStep < 1) {
    console.log("\n>>> Deploying FeeEngine...");
    const FeeEngine = await hre.ethers.getContractFactory("FeeEngine");
    const feeEngine = await hre.upgrades.deployProxy(
      FeeEngine, 
      [timelockAddress, usdcAddress, deployer.address], 
      { kind: "uups", txOverrides }
    );
    await feeEngine.waitForDeployment();
    deployed.feeEngine = await feeEngine.getAddress();
    console.log("  FeeEngine:", deployed.feeEngine);
    existing.v6Step = 1;
    save();
  } else {
    console.log("  ℹ️ FeeEngine already deployed at:", deployed.feeEngine);
  }

  // ── 2. NEW: NAVOracle ──────────────────────────────────────
  if (currentStep < 2) {
    console.log("\n>>> Deploying NAVOracle...");
    const NAVOracle = await hre.ethers.getContractFactory("NAVOracle");
    const navOracle = await hre.upgrades.deployProxy(
      NAVOracle, 
      [deployed.feeEngine, deployer.address], 
      { kind: "uups", txOverrides }
    );
    await navOracle.waitForDeployment();
    deployed.navOracle = await navOracle.getAddress();
    console.log("  NAVOracle:", deployed.navOracle);
    existing.v6Step = 2;
    save();
  } else {
    console.log("  ℹ️ NAVOracle already deployed at:", deployed.navOracle);
  }

  // ── 3. UPGRADE: AssetRegistry, AssetFactory, Compliance (UUPS proxies) ─────────────────
  if (currentStep < 3) {
    console.log("\n>>> Upgrading proxies...");
    const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
    await hre.upgrades.upgradeProxy(deployed.assetRegistry, AssetRegistry, { txOverrides });
    console.log("  AssetRegistry upgraded:", deployed.assetRegistry);

    const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
    await hre.upgrades.upgradeProxy(deployed.assetFactory, AssetFactory, { txOverrides });
    console.log("  AssetFactory upgraded:", deployed.assetFactory);

    const Compliance = await hre.ethers.getContractFactory("Compliance");
    await hre.upgrades.upgradeProxy(deployed.complianceModule, Compliance, { txOverrides });
    console.log("  Compliance upgraded:", deployed.complianceModule);
    existing.v6Step = 3;
    save();
  } else {
    console.log("  ℹ️ Proxies already upgraded.");
  }

  // ── 4. RE-DEPLOY: SettlementEngine (standalone) ─────────────
  if (currentStep < 4) {
    console.log("\n>>> Re-deploying SettlementEngine...");
    const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
    const settlement = await SettlementEngine.deploy(txOverrides);
    await settlement.waitForDeployment();
    deployed.settlementEngine = await settlement.getAddress();
    console.log("  SettlementEngine:", deployed.settlementEngine);
    existing.v6Step = 4;
    save();
  } else {
    console.log("  ℹ️ SettlementEngine already deployed at:", deployed.settlementEngine);
  }

  // ── 5. RE-DEPLOY: PriceOracle (standalone) ──────────────────
  if (currentStep < 5) {
    console.log("\n>>> Re-deploying PriceOracle...");
    const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
    const priceOracle = await PriceOracle.deploy(txOverrides);
    await priceOracle.waitForDeployment();
    deployed.priceOracle = await priceOracle.getAddress();
    console.log("  PriceOracle:", deployed.priceOracle);
    existing.v6Step = 5;
    save();
  } else {
    console.log("  ℹ️ PriceOracle already deployed at:", deployed.priceOracle);
  }

  // ── 6. RE-DEPLOY: AssetToken template (standalone) ──────────
  if (currentStep < 6) {
    console.log("\n>>> Re-deploying AssetToken template...");
    const AssetToken = await hre.ethers.getContractFactory("AssetToken");
    const assetToken = await AssetToken.deploy(txOverrides);
    await assetToken.waitForDeployment();
    deployed.assetTokenTemplate = await assetToken.getAddress();
    console.log("  AssetToken template:", deployed.assetTokenTemplate);
    existing.v6Step = 6;
    save();
  } else {
    console.log("  ℹ️ AssetToken template already deployed at:", deployed.assetTokenTemplate);
  }

  // ── 7. RE-DEPLOY: SyncVault template (standalone) ───────────
  if (currentStep < 7) {
    console.log("\n>>> Re-deploying SyncVault template...");
    const SyncVault = await hre.ethers.getContractFactory("SyncVault");
    const syncVault = await SyncVault.deploy(txOverrides);
    await syncVault.waitForDeployment();
    deployed.syncVaultTemplate = await syncVault.getAddress();
    console.log("  SyncVault template:", deployed.syncVaultTemplate);
    existing.v6Step = 7;
    save();
  } else {
    console.log("  ℹ️ SyncVault template already deployed at:", deployed.syncVaultTemplate);
  }

  // ── 8. CONFIGURE: Point factories to new templates ─────────
  if (currentStep < 8) {
    console.log("\n>>> Configuring factories...");
    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployed.vaultFactory);
    const assetFactory = await hre.ethers.getContractAt("AssetFactory", deployed.assetFactory);

    await (await vaultFactory.setSyncVaultTemplate(deployed.syncVaultTemplate, txOverrides)).wait();
    console.log("  VaultFactory -> new SyncVault template");

    await (await assetFactory.setAssetTokenTemplate(deployed.assetTokenTemplate, txOverrides)).wait();
    console.log("  AssetFactory -> new AssetToken template");
    existing.v6Step = 8;
    save();
  } else {
    console.log("  ℹ️ Factories already configured.");
  }

  // ── 9. POST-CONFIG: Wire FeeEngine + NAVOracle to consumers ──
  if (currentStep < 9) {
    console.log("\n>>> Wiring FeeEngine & NAVOracle...");
    const registry = await hre.ethers.getContractAt("AssetRegistry", deployed.assetRegistry);
    await (await registry.setFeeEngine(deployed.feeEngine, txOverrides)).wait();
    console.log("  AssetRegistry.feeEngine =", deployed.feeEngine);

    const settlementEngine = await hre.ethers.getContractAt("SettlementEngine", deployed.settlementEngine);
    await (await settlementEngine.setFeeEngine(deployed.feeEngine, txOverrides)).wait();
    console.log("  SettlementEngine.feeEngine =", deployed.feeEngine);

    const navOracleContract = await hre.ethers.getContractAt("NAVOracle", deployed.navOracle);
    await (await navOracleContract.setUSDC(usdcAddress, txOverrides)).wait();
    console.log("  NAVOracle.usdc =", usdcAddress);
    await (await navOracleContract.setAssetFactory(deployed.assetFactory, txOverrides)).wait();
    console.log("  NAVOracle.assetFactory =", deployed.assetFactory);

    const priceOracleContract = await hre.ethers.getContractAt("PriceOracle", deployed.priceOracle);
    await (await priceOracleContract.setNavOracle(deployed.navOracle, txOverrides)).wait();
    console.log("  PriceOracle.navOracle =", deployed.navOracle);

    existing.v6Step = 9;
    save();
  } else {
    console.log("  ℹ️ System wiring already complete.");
  }

  console.log("\n✅ v6.0.0 upgrade complete!");
  console.log("Final deployment file:", path.basename(deploymentFile));
}

main().catch((e) => { console.error(e); process.exit(1); });
