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

  const gasPrice = hre.ethers.parseUnits("10", "gwei");
  const txOverrides = { gasPrice };

  // ── 1. NEW: FeeEngine ──────────────────────────────────────
  console.log("\n>>> Deploying FeeEngine...");
  const FeeEngine = await hre.ethers.getContractFactory("FeeEngine");
  const feeEngine = await hre.upgrades.deployProxy(FeeEngine, [deployer.address], {
    kind: "uups", txOverrides
  });
  await feeEngine.waitForDeployment();
  deployed.feeEngine = await feeEngine.getAddress();
  console.log("  FeeEngine:", deployed.feeEngine);
  save();

  // ── 2. NEW: NAVOracle ──────────────────────────────────────
  console.log("\n>>> Deploying NAVOracle...");
  const NAVOracle = await hre.ethers.getContractFactory("NAVOracle");
  const navOracle = await hre.upgrades.deployProxy(NAVOracle, [deployed.feeEngine, deployer.address], {
    kind: "uups", txOverrides
  });
  await navOracle.waitForDeployment();
  deployed.navOracle = await navOracle.getAddress();
  console.log("  NAVOracle:", deployed.navOracle);
  save();

  // ── 3. UPGRADE: AssetRegistry (UUPS proxy) ─────────────────
  console.log("\n>>> Upgrading AssetRegistry...");
  const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
  await hre.upgrades.upgradeProxy(deployed.assetRegistry, AssetRegistry, { txOverrides });
  console.log("  AssetRegistry upgraded:", deployed.assetRegistry);

  // ── 4. UPGRADE: AssetFactory (UUPS proxy) ──────────────────
  console.log("\n>>> Upgrading AssetFactory...");
  const AssetFactory = await hre.ethers.getContractFactory("AssetFactory");
  await hre.upgrades.upgradeProxy(deployed.assetFactory, AssetFactory, { txOverrides });
  console.log("  AssetFactory upgraded:", deployed.assetFactory);

  // ── 5. UPGRADE: Compliance (UUPS proxy) ────────────────────
  console.log("\n>>> Upgrading Compliance...");
  const Compliance = await hre.ethers.getContractFactory("Compliance");
  await hre.upgrades.upgradeProxy(deployed.complianceModule, Compliance, { txOverrides });
  console.log("  Compliance upgraded:", deployed.complianceModule);

  // ── 6. RE-DEPLOY: SettlementEngine (standalone) ─────────────
  console.log("\n>>> Re-deploying SettlementEngine...");
  const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
  const settlement = await SettlementEngine.deploy(txOverrides);
  await settlement.waitForDeployment();
  deployed.settlementEngine = await settlement.getAddress();
  console.log("  SettlementEngine:", deployed.settlementEngine);
  save();

  // ── 7. RE-DEPLOY: PriceOracle (standalone) ──────────────────
  console.log("\n>>> Re-deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(txOverrides);
  await priceOracle.waitForDeployment();
  deployed.priceOracle = await priceOracle.getAddress();
  console.log("  PriceOracle:", deployed.priceOracle);
  save();

  // ── 8. RE-DEPLOY: AssetToken template (standalone) ──────────
  console.log("\n>>> Re-deploying AssetToken template...");
  const AssetToken = await hre.ethers.getContractFactory("AssetToken");
  const assetToken = await AssetToken.deploy(txOverrides);
  await assetToken.waitForDeployment();
  deployed.assetTokenTemplate = await assetToken.getAddress();
  console.log("  AssetToken template:", deployed.assetTokenTemplate);

  // ── 9. RE-DEPLOY: SyncVault template (standalone) ───────────
  console.log("\n>>> Re-deploying SyncVault template...");
  const SyncVault = await hre.ethers.getContractFactory("SyncVault");
  const syncVault = await SyncVault.deploy(txOverrides);
  await syncVault.waitForDeployment();
  deployed.syncVaultTemplate = await syncVault.getAddress();
  console.log("  SyncVault template:", deployed.syncVaultTemplate);
  save();

  // ── 10. CONFIGURE: Point factories to new templates ─────────
  console.log("\n>>> Configuring factories...");

  const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployed.vaultFactory);
  const assetFactory = await hre.ethers.getContractAt("AssetFactory", deployed.assetFactory);

  await (await vaultFactory.setSyncVaultTemplate(deployed.syncVaultTemplate, txOverrides)).wait();
  console.log("  VaultFactory -> new SyncVault template");

  await (await assetFactory.setAssetTokenTemplate(deployed.assetTokenTemplate, txOverrides)).wait();
  console.log("  AssetFactory -> new AssetToken template");

  save();

  // ── 11. POST-CONFIG: Wire FeeEngine + NAVOracle to consumers ──
  console.log("\n>>> Wiring FeeEngine & NAVOracle...");

  const registry = await hre.ethers.getContractAt("AssetRegistry", deployed.assetRegistry);
  await (await registry.setFeeEngine(deployed.feeEngine, txOverrides)).wait();
  console.log("  AssetRegistry.feeEngine =", deployed.feeEngine);

  const compliance = await hre.ethers.getContractAt("Compliance", deployed.complianceModule);
  const settlementEngine = await hre.ethers.getContractAt("SettlementEngine", deployed.settlementEngine);
  await (await settlementEngine.setFeeEngine(deployed.feeEngine, txOverrides)).wait();
  console.log("  SettlementEngine.feeEngine =", deployed.feeEngine);

  console.log("\n✅ v6.0.0 upgrade complete!");
  console.log("Final deployment file:", path.basename(deploymentFile));
}

main().catch((e) => { console.error(e); process.exit(1); });
