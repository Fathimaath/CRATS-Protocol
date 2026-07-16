const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("================================================================================");
    console.log("   CRATS PROTOCOL - SEPOLIA v10.0.0 UPGRADES & CARBON DEPLOYMENT");
    console.log("================================================================================");

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer Address: ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer Balance: ${ethers.formatEther(balance)} ETH`);

    const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia-deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("Sepolia deployment file not found");
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts = deployment.contracts;

    async function getOverrides() {
        const feeData = await ethers.provider.getFeeData();
        const overrides = {};
        if (feeData.maxFeePerGas) {
            overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n;
        } else {
            overrides.gasPrice = feeData.gasPrice ? (feeData.gasPrice * 150n) / 100n : ethers.parseUnits("30", "gwei");
        }
        if (feeData.maxPriorityFeePerGas) {
            overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n;
        }
        return overrides;
    }

    const saveProgress = () => {
        deployment.timestamp = new Date().toISOString();
        fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2), "utf8");
        console.log("  💾 Sepolia progress saved.");
    };

    // 1. Upgrade AssetRegistry
    console.log(`\n>>> [1/14] Upgrading AssetRegistry proxy at: ${contracts.assetRegistry}...`);
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const upgradedRegistry = await upgrades.upgradeProxy(contracts.assetRegistry, AssetRegistry, {
        kind: "uups",
        txOverrides: await getOverrides()
    });
    await upgradedRegistry.waitForDeployment();
    console.log("  ✅ AssetRegistry upgraded.");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 2. Upgrade NAVOracle
    console.log(`\n>>> [2/14] Upgrading NAVOracle proxy at: ${contracts.navOracle}...`);
    const NAVOracle = await ethers.getContractFactory("NAVOracle");
    const upgradedNAVOracle = await upgrades.upgradeProxy(contracts.navOracle, NAVOracle, {
        kind: "uups",
        txOverrides: await getOverrides()
    });
    await upgradedNAVOracle.waitForDeployment();
    console.log("  ✅ NAVOracle upgraded.");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 3. Upgrade LifecycleExitManager
    console.log(`\n>>> [3/14] Upgrading LifecycleExitManager proxy at: ${contracts.lifecycleExitManager}...`);
    const LifecycleExitManager = await ethers.getContractFactory("LifecycleExitManager");
    const upgradedExitManager = await upgrades.upgradeProxy(contracts.lifecycleExitManager, LifecycleExitManager, {
        kind: "uups",
        txOverrides: await getOverrides()
    });
    await upgradedExitManager.waitForDeployment();
    console.log("  ✅ LifecycleExitManager upgraded.");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // Configure new links on LifecycleExitManager
    console.log("Configuring links on LifecycleExitManager...");
    await (await upgradedExitManager.setNAVOracle(contracts.navOracle, await getOverrides())).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    await (await upgradedExitManager.setRedemptionManager(contracts.redemptionManager, await getOverrides())).wait();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);
    // 3.5. Redeploy OwnershipSyncManager to support v10 constants
    console.log(`\n>>> [3.5/14] Deploying new OwnershipSyncManager...`);
    const OwnershipSyncManager = await ethers.getContractFactory("OwnershipSyncManager");
    const newSyncManager = await OwnershipSyncManager.deploy(deployer.address, contracts.assetRegistry, await getOverrides());
    await newSyncManager.waitForDeployment();
    const newSyncManagerAddr = await newSyncManager.getAddress();
    console.log(`  ✅ OwnershipSyncManager deployed at: ${newSyncManagerAddr}`);
    contracts.syncManager = newSyncManagerAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // Grant SYNC_MANAGER_ROLE on AssetRegistry to new syncManager
    console.log("Granting SYNC_MANAGER_ROLE to new OwnershipSyncManager on AssetRegistry...");
    const SYNC_MANAGER_ROLE = await upgradedRegistry.SYNC_MANAGER_ROLE();
    await (await upgradedRegistry.grantRole(SYNC_MANAGER_ROLE, newSyncManagerAddr, await getOverrides())).wait();
    console.log("  ✅ SYNC_MANAGER_ROLE granted.");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // Update syncManager reference in VaultFactory
    let vaultFactory = await ethers.getContractAt("VaultFactory", contracts.vaultFactory);
    await (await vaultFactory.setSyncManager(newSyncManagerAddr, await getOverrides())).wait();
    console.log("  ✅ VaultFactory updated to use new OwnershipSyncManager");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // Set OwnershipSyncManager on LifecycleExitManager
    await (await upgradedExitManager.setOwnershipSyncManager(newSyncManagerAddr, await getOverrides())).wait();
    console.log("  ✅ LifecycleExitManager updated to use new OwnershipSyncManager");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 4. Deploy and set new SyncVault Template
    console.log(`\n>>> [4/14] Deploying new SyncVault template...`);
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const syncTemplate = await SyncVault.deploy(await getOverrides());
    await syncTemplate.waitForDeployment();
    const syncTemplateAddr = await syncTemplate.getAddress();
    console.log("  ✅ SyncVault Template deployed at:", syncTemplateAddr);
    contracts.syncVaultTemplate = syncTemplateAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    vaultFactory = await ethers.getContractAt("VaultFactory", contracts.vaultFactory);
    await (await vaultFactory.setSyncVaultTemplate(syncTemplateAddr, await getOverrides())).wait();
    console.log("  ✅ VaultFactory updated to use new SyncVault Template");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 5. Deploy DMSRegistry
    console.log(`\n>>> [5/14] Deploying DMSRegistry...`);
    const DMSRegistry = await ethers.getContractFactory("DMSRegistry");
    const dmsRegistry = await DMSRegistry.deploy(deployer.address, await getOverrides());
    await dmsRegistry.waitForDeployment();
    const dmsRegistryAddr = await dmsRegistry.getAddress();
    console.log("  ✅ DMSRegistry deployed at:", dmsRegistryAddr);
    contracts.dmsRegistry = dmsRegistryAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 6. Deploy SanctionsOracle
    console.log(`\n>>> [6/14] Deploying SanctionsOracle...`);
    const SanctionsOracle = await ethers.getContractFactory("SanctionsOracle");
    const sanctionsOracle = await SanctionsOracle.deploy(deployer.address, await getOverrides());
    await sanctionsOracle.waitForDeployment();
    const sanctionsOracleAddr = await sanctionsOracle.getAddress();
    console.log("  ✅ SanctionsOracle deployed at:", sanctionsOracleAddr);
    contracts.sanctionsOracle = sanctionsOracleAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 7. Deploy CarbonCreditPlugin
    console.log(`\n>>> [7/14] Deploying CarbonCreditPlugin...`);
    const CarbonCreditPlugin = await ethers.getContractFactory("CarbonCreditPlugin");
    const carbonCreditPlugin = await CarbonCreditPlugin.deploy(deployer.address, await getOverrides());
    await carbonCreditPlugin.waitForDeployment();
    const carbonCreditPluginAddr = await carbonCreditPlugin.getAddress();
    console.log("  ✅ CarbonCreditPlugin deployed at:", carbonCreditPluginAddr);
    contracts.carbonCreditPlugin = carbonCreditPluginAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    await (await carbonCreditPlugin.setDMSRegistry(dmsRegistryAddr, await getOverrides())).wait();
    console.log("  Linked DMSRegistry to CarbonCreditPlugin");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 8. Deploy CarbonRetirementPlugin
    console.log(`\n>>> [8/14] Deploying CarbonRetirementPlugin...`);
    const CarbonRetirementPlugin = await ethers.getContractFactory("CarbonRetirementPlugin");
    const carbonRetirementPlugin = await CarbonRetirementPlugin.deploy(deployer.address, await getOverrides());
    await carbonRetirementPlugin.waitForDeployment();
    const carbonRetirementPluginAddr = await carbonRetirementPlugin.getAddress();
    console.log("  ✅ CarbonRetirementPlugin deployed at:", carbonRetirementPluginAddr);
    contracts.carbonRetirementPlugin = carbonRetirementPluginAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    await (await carbonRetirementPlugin.setDMSRegistry(dmsRegistryAddr, await getOverrides())).wait();
    console.log("  Linked DMSRegistry to CarbonRetirementPlugin");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 9. Deploy CarbonBatchManager
    console.log(`\n>>> [9/14] Deploying CarbonBatchManager...`);
    const CarbonBatchManager = await ethers.getContractFactory("CarbonBatchManager");
    const carbonBatchManager = await CarbonBatchManager.deploy(deployer.address, await getOverrides());
    await carbonBatchManager.waitForDeployment();
    const carbonBatchManagerAddr = await carbonBatchManager.getAddress();
    console.log("  ✅ CarbonBatchManager deployed at:", carbonBatchManagerAddr);
    contracts.carbonBatchManager = carbonBatchManagerAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 10. Deploy CarbonAssetMetadataStore
    console.log(`\n>>> [10/14] Deploying CarbonAssetMetadataStore...`);
    const CarbonAssetMetadataStore = await ethers.getContractFactory("CarbonAssetMetadataStore");
    const carbonMetadataStore = await CarbonAssetMetadataStore.deploy(deployer.address, await getOverrides());
    await carbonMetadataStore.waitForDeployment();
    const carbonMetadataStoreAddr = await carbonMetadataStore.getAddress();
    console.log("  ✅ CarbonAssetMetadataStore deployed at:", carbonMetadataStoreAddr);
    contracts.carbonMetadataStore = carbonMetadataStoreAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 11. Deploy CarbonRetirementManager
    console.log(`\n>>> [11/14] Deploying CarbonRetirementManager...`);
    const CarbonRetirementManager = await ethers.getContractFactory("CarbonRetirementManager");
    const carbonRetirementManager = await CarbonRetirementManager.deploy(
        deployer.address,
        carbonBatchManagerAddr,
        carbonMetadataStoreAddr,
        contracts.syncManager,
        await getOverrides()
    );
    await carbonRetirementManager.waitForDeployment();
    const carbonRetirementManagerAddr = await carbonRetirementManager.getAddress();
    console.log("  ✅ CarbonRetirementManager deployed at:", carbonRetirementManagerAddr);
    contracts.carbonRetirementManager = carbonRetirementManagerAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 12. Deploy GovernanceMultisig
    console.log(`\n>>> [12/14] Deploying GovernanceMultisig...`);
    const GovernanceMultisig = await ethers.getContractFactory("GovernanceMultisig");
    const governanceMultisig = await GovernanceMultisig.deploy(
        deployer.address,
        [deployer.address],
        1,
        0,
        deployer.address,
        await getOverrides()
    );
    await governanceMultisig.waitForDeployment();
    const governanceMultisigAddr = await governanceMultisig.getAddress();
    console.log("  ✅ GovernanceMultisig deployed at:", governanceMultisigAddr);
    contracts.governanceMultisig = governanceMultisigAddr;
    saveProgress();
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 13. Register plugins in AssetFactory
    console.log(`\n>>> [13/14] Registering plugins in AssetFactory...`);
    const assetFactory = await ethers.getContractAt("AssetFactory", contracts.assetFactory);
    
    const CARBON_CREDIT = ethers.id("CARBON_CREDIT");
    await (await assetFactory.registerPlugin(CARBON_CREDIT, carbonCreditPluginAddr, await getOverrides())).wait();
    console.log("  Registered CarbonCreditPlugin on AssetFactory");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    const CARBON_RETIREMENT = ethers.id("CARBON_RETIREMENT");
    await (await assetFactory.registerPlugin(CARBON_RETIREMENT, carbonRetirementPluginAddr, await getOverrides())).wait();
    console.log("  Registered CarbonRetirementPlugin on AssetFactory");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // 14. Configure roles and permissions
    console.log(`\n>>> [14/14] Wiring roles & authorizations...`);
    
    // Authorize CarbonRetirementManager on CarbonBatchManager
    await (await carbonBatchManager.setOperator(carbonRetirementManagerAddr, true, await getOverrides())).wait();
    console.log("  Authorized CarbonRetirementManager on CarbonBatchManager");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // Authorize CarbonRetirementManager on CarbonAssetMetadataStore
    const RETIREMENT_MANAGER_ROLE = await carbonMetadataStore.RETIREMENT_MANAGER_ROLE();
    await (await carbonMetadataStore.grantRole(RETIREMENT_MANAGER_ROLE, carbonRetirementManagerAddr, await getOverrides())).wait();
    console.log("  Granted RETIREMENT_MANAGER_ROLE to CarbonRetirementManager");
    console.log("Sleeping 15 seconds...");
    await sleep(15000);

    // Authorize CarbonRetirementManager on OwnershipSyncManager
    const syncManager = await ethers.getContractAt("OwnershipSyncManager", contracts.syncManager);
    const syncManagerReason = await syncManager.CARBON_RETIREMENT();
    await (await syncManager.authorizeModule(carbonRetirementManagerAddr, syncManagerReason, await getOverrides())).wait();
    console.log("  Authorized CarbonRetirementManager on OwnershipSyncManager with reason code CARBON_RETIREMENT");

    console.log("\n================================================================================");
    console.log("🎉 SUCCESS: CRATS PROTOCOL v10.0.0 UPGRADES & NEW CONTRACTS FULLY DEPLOYED ON SEPOLIA!");
    console.log("💾 Final Sepolia Registry Saved to: sepolia-deployment.json");
    console.log("================================================================================");
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
