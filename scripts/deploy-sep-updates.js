const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("================================================================================");
    console.log("   CRATS PROTOCOL - SEPOLIA UPDATE DEPLOYMENT");
    console.log("================================================================================");

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    // Load Sepolia deployment info
    const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia-deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("Sepolia deployment file not found");
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts = deployment.contracts;

    // 1. Upgrade AssetRegistry
    console.log(`\n>>> [1/7] Upgrading AssetRegistry proxy at: ${contracts.assetRegistry}...`);
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const upgradedAssetRegistry = await upgrades.upgradeProxy(contracts.assetRegistry, AssetRegistry);
    await upgradedAssetRegistry.waitForDeployment();
    console.log("✅ AssetRegistry upgraded successfully.");
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // 2. Deploy OwnershipSyncManager
    console.log(`\n>>> [2/7] Deploying OwnershipSyncManager...`);
    const OwnershipSyncManager = await ethers.getContractFactory("OwnershipSyncManager");
    const syncManager = await OwnershipSyncManager.deploy(deployer.address, contracts.assetRegistry);
    await syncManager.waitForDeployment();
    const syncManagerAddr = await syncManager.getAddress();
    console.log(`✅ OwnershipSyncManager deployed at: ${syncManagerAddr}`);
    contracts.syncManager = syncManagerAddr;
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // 3. Grant SYNC_MANAGER_ROLE to syncManager in AssetRegistry
    console.log(`\n>>> [3/7] Granting SYNC_MANAGER_ROLE in AssetRegistry...`);
    const syncManagerRole = ethers.id("SYNC_MANAGER_ROLE");
    const grantTx = await upgradedAssetRegistry.grantRole(syncManagerRole, syncManagerAddr);
    await grantTx.wait();
    console.log("✅ SYNC_MANAGER_ROLE granted to OwnershipSyncManager.");
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // 4. Deploy SyncVault & AsyncVault templates
    console.log(`\n>>> [4/7] Deploying Vault Templates...`);
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const syncTemplate = await SyncVault.deploy();
    await syncTemplate.waitForDeployment();
    const syncTemplateAddr = await syncTemplate.getAddress();
    console.log(`✅ SyncVault Template deployed at: ${syncTemplateAddr}`);
    contracts.syncVaultTemplate = syncTemplateAddr;
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    const AsyncVault = await ethers.getContractFactory("AsyncVault");
    const asyncTemplate = await AsyncVault.deploy();
    await asyncTemplate.waitForDeployment();
    const asyncTemplateAddr = await asyncTemplate.getAddress();
    console.log(`✅ AsyncVault Template deployed at: ${asyncTemplateAddr}`);
    contracts.asyncVaultTemplate = asyncTemplateAddr;
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // 5. Deploy VaultFactory
    console.log(`\n>>> [5/7] Deploying VaultFactory...`);
    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    const vaultFactory = await VaultFactory.deploy(deployer.address);
    await vaultFactory.waitForDeployment();
    const vaultFactoryAddr = await vaultFactory.getAddress();
    console.log(`✅ VaultFactory deployed at: ${vaultFactoryAddr}`);
    contracts.vaultFactory = vaultFactoryAddr;
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // 6. Configure VaultFactory
    console.log(`\n>>> [6/7] Configuring VaultFactory links...`);
    await (await vaultFactory.setSyncVaultTemplate(syncTemplateAddr)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setAsyncVaultTemplate(asyncTemplateAddr)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setIdentityRegistry(contracts.identityRegistry)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setComplianceModule(contracts.complianceModule)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setCircuitBreakerModule(contracts.circuitBreaker)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setYieldDistributor(contracts.yieldDistributor)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setRedemptionManager(contracts.redemptionManager)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setAssetFactory(contracts.assetFactory)).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await vaultFactory.setSyncManager(syncManagerAddr)).wait();
    console.log("✅ VaultFactory fully configured and linked.");
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // Grant VAULT_FACTORY_ROLE to new vaultFactory in AssetFactory
    console.log("Granting VAULT_FACTORY_ROLE to new VaultFactory in AssetFactory...");
    const assetFactory = await ethers.getContractAt("AssetFactory", contracts.assetFactory);
    const vaultFactoryRole = ethers.id("VAULT_FACTORY_ROLE");
    await (await assetFactory.grantRole(vaultFactoryRole, vaultFactoryAddr)).wait();
    console.log("✅ VAULT_FACTORY_ROLE granted to new VaultFactory.");
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // Grant OPERATOR_ROLE to assetFactory in AssetRegistry (re-verify/grant just in case)
    console.log("Granting OPERATOR_ROLE to AssetFactory in AssetRegistry...");
    const operatorRole = ethers.id("OPERATOR_ROLE");
    await (await upgradedAssetRegistry.grantRole(operatorRole, contracts.assetFactory)).wait();
    console.log("✅ OPERATOR_ROLE granted.");
    console.log("Sleeping 15 seconds to sync nonce...");
    await sleep(15000);

    // 7. Upgrade LifecycleExitManager UUPS Proxy
    console.log(`\n>>> [7/7] Upgrading LifecycleExitManager proxy at: ${contracts.lifecycleExitManager}...`);
    const LifecycleExitManager = await ethers.getContractFactory("LifecycleExitManager");
    const upgradedExitManager = await upgrades.upgradeProxy(contracts.lifecycleExitManager, LifecycleExitManager);
    await upgradedExitManager.waitForDeployment();
    console.log("✅ LifecycleExitManager upgraded successfully.");

    // Save updated deployment info
    deployment.timestamp = new Date().toISOString();
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2), "utf8");
    console.log(`\n💾 Saved updated registry to: ${deploymentPath}`);
    console.log("================================================================================");
    console.log("🎉 SEPOLIA DEPLOYMENT & UPGRADES SUCCESSFULLY COMPLETED!");
    console.log("================================================================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
