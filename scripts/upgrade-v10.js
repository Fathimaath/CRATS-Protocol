const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n========================================================");
    console.log("   CRATS PROTOCOL - PROXY UPGRADES (v10.0.0)");
    console.log("========================================================\n");

    const [deployer] = await ethers.getSigners();
    const network = hre.network.name === "unknown" ? "localhost" : hre.network.name;
    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);

    if (!fs.existsSync(deploymentFile)) {
        throw new Error(`Deployment file not found for network ${network}`);
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const contracts = deployment.contracts;

    // 1. Upgrade AssetRegistry
    console.log(`Upgrading AssetRegistry proxy at: ${contracts.assetRegistry}...`);
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const upgradedAssetRegistry = await upgrades.upgradeProxy(contracts.assetRegistry, AssetRegistry);
    await upgradedAssetRegistry.waitForDeployment();
    console.log("  ✅ AssetRegistry upgraded.");

    // 2. Upgrade NAVOracle
    console.log(`Upgrading NAVOracle proxy at: ${contracts.navOracle}...`);
    const NAVOracle = await ethers.getContractFactory("NAVOracle");
    const upgradedNAVOracle = await upgrades.upgradeProxy(contracts.navOracle, NAVOracle);
    await upgradedNAVOracle.waitForDeployment();
    console.log("  ✅ NAVOracle upgraded.");

    // 3. Upgrade LifecycleExitManager
    console.log(`Upgrading LifecycleExitManager proxy at: ${contracts.lifecycleExitManager}...`);
    const LifecycleExitManager = await ethers.getContractFactory("LifecycleExitManager");
    const upgradedExitManager = await upgrades.upgradeProxy(contracts.lifecycleExitManager, LifecycleExitManager);
    await upgradedExitManager.waitForDeployment();
    console.log("  ✅ LifecycleExitManager upgraded.");

    // 4. Deploy and set new SyncVault Template
    console.log(`Deploying new SyncVault Template...`);
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const syncTemplate = await SyncVault.deploy();
    await syncTemplate.waitForDeployment();
    const syncTemplateAddr = await syncTemplate.getAddress();
    console.log("  ✅ SyncVault Template deployed at:", syncTemplateAddr);
    contracts.syncVaultTemplate = syncTemplateAddr;

    const vaultFactory = await ethers.getContractAt("VaultFactory", contracts.vaultFactory);
    await (await vaultFactory.setSyncVaultTemplate(syncTemplateAddr)).wait();
    console.log("  ✅ VaultFactory updated to use new SyncVault Template");

    // Configure new links on LifecycleExitManager
    console.log("Configuring links on LifecycleExitManager...");
    await (await upgradedExitManager.setNAVOracle(contracts.navOracle)).wait();
    await (await upgradedExitManager.setRedemptionManager(contracts.redemptionManager)).wait();
    if (contracts.governanceMultisig) {
        await (await upgradedExitManager.setGovernanceMultisig(contracts.governanceMultisig)).wait();
    }
    if (contracts.syncManager) {
        await (await upgradedExitManager.setOwnershipSyncManager(contracts.syncManager)).wait();
    }
    console.log("  ✅ LifecycleExitManager links configured.");

    // Save Deployment JSON
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log("\n💾 Deployment progress successfully saved to:", path.basename(deploymentFile));
    console.log("========================================================\n");
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
