const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("==================================================");
    console.log("   Redeploying Updated RedemptionManager to Sepolia");
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

    // 1. Deploy new RedemptionManager
    console.log("\n>>> Deploying updated RedemptionManager...");
    await waitForMempool();

    const RedemptionManager = await hre.ethers.getContractFactory("RedemptionManager");
    const rm = await RedemptionManager.deploy(deployer.address, await getOverrides());
    await rm.waitForDeployment();
    const rmAddr = await rm.getAddress();
    console.log("  ✅ RedemptionManager deployed at:", rmAddr);

    // 2. Configure AssetRegistry
    await waitForMempool();
    if (deployed.assetRegistry) {
        await (await rm.setAssetRegistry(deployed.assetRegistry, await getOverrides())).wait();
        console.log("  ✅ AssetRegistry set in RedemptionManager");
    }

    // 3. Configure OwnershipSyncManager
    await waitForMempool();
    if (deployed.syncManager) {
        await (await rm.setOwnershipSyncManager(deployed.syncManager, await getOverrides())).wait();
        console.log("  ✅ OwnershipSyncManager set in RedemptionManager");
    }

    // 4. Configure NAV Oracle
    await waitForMempool();
    if (deployed.navOracle) {
        await (await rm.setNavOracle(deployed.navOracle, await getOverrides())).wait();
        console.log("  ✅ NAV Oracle set in RedemptionManager");
    }

    // 5. Wire VaultFactory to point to new RedemptionManager
    if (deployed.vaultFactory) {
        await waitForMempool();
        console.log("\n>>> Wiring VaultFactory to new RedemptionManager...");
        const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployed.vaultFactory);
        await (await vaultFactory.setRedemptionManager(rmAddr, await getOverrides())).wait();
        console.log("  ✅ VaultFactory.redemptionManager updated");
    }

    // 6. Wire LifecycleExitManager to new RedemptionManager
    if (deployed.lifecycleExitManager) {
        await waitForMempool();
        console.log("\n>>> Wiring LifecycleExitManager to new RedemptionManager...");
        const lifecycleExitManager = await hre.ethers.getContractAt("LifecycleExitManager", deployed.lifecycleExitManager);
        await (await lifecycleExitManager.setRedemptionManager(rmAddr, await getOverrides())).wait();
        console.log("  ✅ LifecycleExitManager.redemptionManager updated");
    }

    // 7. Update sepolia-deployment.json
    data.contracts.redemptionManager = rmAddr;
    data.timestamp = new Date().toISOString();
    fs.writeFileSync(deploymentFile, JSON.stringify(data, null, 2));
    console.log(`\n💾 Updated ${path.basename(deploymentFile)} with new RedemptionManager address: ${rmAddr}`);
    console.log("\n🎉 REDEPLOYMENT COMPLETE!");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
