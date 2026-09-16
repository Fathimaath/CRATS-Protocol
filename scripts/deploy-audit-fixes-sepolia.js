const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("==================================================");
    console.log("   CRATS Audit Fixes — Sepolia Deployment (Q1-Q4)");
    console.log("==================================================\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;

    if (network !== "sepolia") {
        throw new Error("This script must be run on the sepolia network");
    }

    console.log("Deployer Address:", deployer.address);
    console.log("Network:", network);

    const deploymentFile = path.join(process.cwd(), "deployments", "sepolia-deployment.json");
    if (!fs.existsSync(deploymentFile)) {
        throw new Error(`Deployment file not found at ${deploymentFile}`);
    }

    const data = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const deployed = data.contracts;

    async function waitForMempool() {
        let latest = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
        let pending = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
        if (pending > latest) {
            console.log(`⏳ Waiting for ${pending - latest} pending tx(s)...`);
            while (pending > latest) {
                await new Promise(r => setTimeout(r, 5000));
                latest = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
                pending = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
            }
            console.log("✅ Mempool clear.");
        }
    }

    async function getOverrides() {
        const feeData = await hre.ethers.provider.getFeeData();
        const overrides = {};
        if (feeData.maxFeePerGas) {
            overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n;
        } else {
            overrides.gasPrice = feeData.gasPrice
                ? (feeData.gasPrice * 150n) / 100n
                : hre.ethers.parseUnits("30", "gwei");
        }
        if (feeData.maxPriorityFeePerGas) {
            overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n;
        }
        return overrides;
    }

    // ============================================================
    // Q1-Q3: Deploy new RedemptionManager
    // ============================================================
    console.log("\n--- Q1-Q3: Deploying new RedemptionManager ---");
    await waitForMempool();

    const RedemptionManager = await hre.ethers.getContractFactory("RedemptionManager");
    const rm = await RedemptionManager.deploy(deployer.address, await getOverrides());
    await rm.waitForDeployment();
    const rmAddr = await rm.getAddress();
    console.log("  ✅ RedemptionManager deployed at:", rmAddr);

    // Configure AssetRegistry (Q3 — NAV variance checks)
    await waitForMempool();
    await (await rm.setAssetRegistry(deployed.assetRegistry, await getOverrides())).wait();
    console.log("  ✅ AssetRegistry set");

    // Configure OwnershipSyncManager (Q1 — BOR sync after claim)
    await waitForMempool();
    await (await rm.setOwnershipSyncManager(deployed.syncManager, await getOverrides())).wait();
    console.log("  ✅ OwnershipSyncManager set");

    // Configure NAV Oracle (Q3 — settlement variance enforcement)
    await waitForMempool();
    await (await rm.setNavOracle(deployed.navOracle, await getOverrides())).wait();
    console.log("  ✅ NAV Oracle set");

    // Default settlementVarianceBPS is 500 (5%) — no change needed

    // Wire VaultFactory to point to new RedemptionManager
    await waitForMempool();
    console.log("\n>>> Wiring VaultFactory to new RedemptionManager...");
    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployed.vaultFactory);
    await (await vaultFactory.setRedemptionManager(rmAddr, await getOverrides())).wait();
    console.log("  ✅ VaultFactory.redemptionManager updated");

    // Wire LifecycleExitManager to new RedemptionManager
    await waitForMempool();
    console.log("\n>>> Wiring LifecycleExitManager to new RedemptionManager...");
    const lifecycleExitManager = await hre.ethers.getContractAt("LifecycleExitManager", deployed.lifecycleExitManager);
    await (await lifecycleExitManager.setRedemptionManager(rmAddr, await getOverrides())).wait();
    console.log("  ✅ LifecycleExitManager.redemptionManager updated");

    // ============================================================
    // Q4: Deploy new CarbonRetirementManager
    // ============================================================
    console.log("\n--- Q4: Deploying new CarbonRetirementManager ---");
    await waitForMempool();

    const CarbonRetirementManager = await hre.ethers.getContractFactory("CarbonRetirementManager");
    const crm = await CarbonRetirementManager.deploy(
        deployer.address,
        deployed.carbonBatchManager,
        deployed.carbonMetadataStore,
        deployed.syncManager,
        await getOverrides()
    );
    await crm.waitForDeployment();
    const crmAddr = await crm.getAddress();
    console.log("  ✅ CarbonRetirementManager deployed at:", crmAddr);

    // Authorize new CarbonRetirementManager on OwnershipSyncManager
    await waitForMempool();
    console.log("\n>>> Authorizing new CarbonRetirementManager on SyncManager...");
    const syncManager = await hre.ethers.getContractAt("OwnershipSyncManager", deployed.syncManager);
    const CARBON_RETIREMENT_REASON = await syncManager.CARBON_RETIREMENT();
    await (await syncManager.authorizeModule(crmAddr, CARBON_RETIREMENT_REASON, await getOverrides())).wait();
    console.log("  ✅ New CarbonRetirementManager authorized on OwnershipSyncManager");

    // ============================================================
    // Save updated deployment addresses
    // ============================================================
    const oldRmAddr = deployed.redemptionManager;
    const oldCrmAddr = deployed.carbonRetirementManager;

    deployed.redemptionManager = rmAddr;
    deployed.carbonRetirementManager = crmAddr;
    data.timestamp = new Date().toISOString();

    fs.writeFileSync(deploymentFile, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved updated addresses to ${path.basename(deploymentFile)}`);

    // ============================================================
    // Summary
    // ============================================================
    console.log("\n==================================================");
    console.log("   DEPLOYMENT SUMMARY");
    console.log("==================================================");
    console.log(`  RedemptionManager:     ${oldRmAddr}  →  ${rmAddr}`);
    console.log(`  CarbonRetirementManager: ${oldCrmAddr}  →  ${crmAddr}`);
    console.log("\n  Post-deploy config (already applied):");
    console.log(`    rm.setAssetRegistry(${deployed.assetRegistry})`);
    console.log(`    rm.setOwnershipSyncManager(${deployed.syncManager})`);
    console.log(`    rm.setNavOracle(${deployed.navOracle})`);
    console.log(`    vaultFactory.setRedemptionManager(${rmAddr})`);
    console.log(`    lifecycleExitManager.setRedemptionManager(${rmAddr})`);
    console.log(`    syncManager.authorizeModule(${crmAddr}, CARBON_RETIREMENT)`);
    console.log(`\n  Optional (manual):`);
    console.log(`    crm.setIdentityRegistry(${deployed.identityRegistry})  // Q4 KYC gate`);
    console.log(`    complianceGate.setRedemptionManager(${rmAddr})  // if ComplianceGate deployed`);
    console.log("==================================================\n");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
