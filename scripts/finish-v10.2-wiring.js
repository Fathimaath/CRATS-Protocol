const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("================================================================================");
    console.log("   FINISHING LIFECYCLE EXIT MANAGER WIRING & UPDATING SEPOLIA DEPLOYMENT");
    console.log("================================================================================");

    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;

    if (network !== "sepolia") {
        throw new Error("This script must be run on the sepolia network");
    }

    console.log(`Deployer Address: ${deployer.address}`);
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Sepolia ETH Balance: ${hre.ethers.formatEther(balance)} ETH`);

    const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia-deployment.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const deployed = deployment.contracts;

    const treasuryAddress = "0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d";
    const newSyncVaultAddr = "0x6720580d11EB60A78DFFC99e987F670F47D9Bb50";
    const newAsyncVaultAddr = "0x65b865dB0fC1aC1e232fDBbD73Ef3Ec0E7B40471";
    const newVaultFactoryAddr = "0xf99542Bc951D9B1B765AB61a1c44DceF1998fa25";
    const newRmAddr = "0x8A7A690D4405feA54FeBFf90a4f8aA2603DA1821";
    const newLemAddr = "0xFC9E7618a21534B40a1Cc90bDF33d9dAec3EF556";

    async function waitForMempool() {
        let latest = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
        let pending = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
        if (pending > latest) {
            console.log(`⏳ Waiting for ${pending - latest} pending tx(s)...`);
            while (pending > latest) {
                await sleep(5000);
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
            overrides.gasPrice = (feeData.gasPrice * 150n) / 100n;
        }
        if (feeData.maxPriorityFeePerGas) {
            overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n;
        }
        return overrides;
    }

    const LifecycleExitManagerFactory = await hre.ethers.getContractFactory("LifecycleExitManager");
    const lemContract = LifecycleExitManagerFactory.attach(newLemAddr);

    console.log(`\nAttaching to LifecycleExitManager Proxy at: ${newLemAddr}`);

    // Check existing values
    const currentNavOracle = await lemContract.navOracle();
    const currentRm = await lemContract.redemptionManager();
    const currentSync = await lemContract.ownershipSyncManager();
    const currentTreasury = await lemContract.treasury();

    console.log(`Current NAV Oracle:           ${currentNavOracle}`);
    console.log(`Current RedemptionManager:    ${currentRm}`);
    console.log(`Current OwnershipSyncManager: ${currentSync}`);
    console.log(`Current Treasury:             ${currentTreasury}`);

    if (currentNavOracle.toLowerCase() !== deployed.navOracle.toLowerCase()) {
        console.log(`\nSetting NAV Oracle to ${deployed.navOracle}...`);
        await waitForMempool();
        const tx = await lemContract.setNAVOracle(deployed.navOracle, await getOverrides());
        console.log(`  Tx sent: ${tx.hash}. Waiting for confirmation...`);
        await tx.wait(1);
        console.log("  ✅ NAV Oracle linked.");
    } else {
        console.log("  ✅ NAV Oracle already correctly set.");
    }

    if (currentRm.toLowerCase() !== newRmAddr.toLowerCase()) {
        console.log(`\nSetting RedemptionManager to ${newRmAddr}...`);
        await waitForMempool();
        const tx = await lemContract.setRedemptionManager(newRmAddr, await getOverrides());
        console.log(`  Tx sent: ${tx.hash}. Waiting for confirmation...`);
        await tx.wait(1);
        console.log("  ✅ RedemptionManager linked.");
    } else {
        console.log("  ✅ RedemptionManager already correctly set.");
    }

    if (currentSync.toLowerCase() !== deployed.syncManager.toLowerCase()) {
        console.log(`\nSetting OwnershipSyncManager to ${deployed.syncManager}...`);
        await waitForMempool();
        const tx = await lemContract.setOwnershipSyncManager(deployed.syncManager, await getOverrides());
        console.log(`  Tx sent: ${tx.hash}. Waiting for confirmation...`);
        await tx.wait(1);
        console.log("  ✅ OwnershipSyncManager linked.");
    } else {
        console.log("  ✅ OwnershipSyncManager already correctly set.");
    }

    if (currentTreasury.toLowerCase() !== treasuryAddress.toLowerCase()) {
        console.log(`\nSetting Treasury to ${treasuryAddress}...`);
        await waitForMempool();
        const tx = await lemContract.setTreasury(treasuryAddress, await getOverrides());
        console.log(`  Tx sent: ${tx.hash}. Waiting for confirmation...`);
        await tx.wait(1);
        console.log("  ✅ Treasury linked.");
    } else {
        console.log("  ✅ Treasury already correctly set.");
    }

    // Double check all on-chain values
    console.log("\n>>> Final Verification of LifecycleExitManager on-chain:");
    console.log(`  - NAV Oracle:           ${await lemContract.navOracle()}`);
    console.log(`  - RedemptionManager:    ${await lemContract.redemptionManager()}`);
    console.log(`  - OwnershipSyncManager: ${await lemContract.ownershipSyncManager()}`);
    console.log(`  - Treasury:             ${await lemContract.treasury()}`);
    console.log(`  - USDC:                 ${await lemContract.usdc()}`);
    console.log(`  - AssetRegistry:        ${await lemContract.assetRegistry()}`);
    console.log(`  - SettlementVariance:   ${await lemContract.settlementVarianceBPS()}`);

    // Update deployments/sepolia-deployment.json
    console.log("\n>>> Updating deployments/sepolia-deployment.json...");
    deployed.syncVaultTemplate = newSyncVaultAddr;
    deployed.asyncVaultTemplate = newAsyncVaultAddr;
    deployed.vaultFactory = newVaultFactoryAddr;
    deployed.redemptionManager = newRmAddr;
    deployed.lifecycleExitManager = newLemAddr;
    deployed.treasury = treasuryAddress;
    deployment.version = "10.2.0";
    deployment.timestamp = new Date().toISOString();

    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2), "utf8");
    console.log(`✅ Successfully updated ${deploymentPath}`);
    console.log("🎉 ALL SEPOLIA WIRING COMPLETE!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Execution failed:", error);
        process.exit(1);
    });
