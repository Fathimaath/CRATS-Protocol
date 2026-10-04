const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("================================================================================");
    console.log("   CRATS PROTOCOL - SEPOLIA UPDATED VAULT TEMPLATES DEPLOYMENT");
    console.log("================================================================================");

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer Address: ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Sepolia ETH Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        throw new Error("Deployer account has 0 ETH on Sepolia.");
    }

    // Load Sepolia deployment info
    const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia-deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("Sepolia deployment file not found at " + deploymentPath);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts = deployment.contracts;

    console.log(`Current VaultFactory address: ${contracts.vaultFactory}`);
    console.log(`Current SyncVault template:   ${contracts.syncVaultTemplate}`);
    console.log(`Current AsyncVault template:  ${contracts.asyncVaultTemplate}`);

    // 1. Deploy Updated SyncVault Template
    console.log(`\n>>> [1/4] Deploying Updated SyncVault Template...`);
    const SyncVaultFactory = await ethers.getContractFactory("SyncVault");
    const syncVault = await SyncVaultFactory.deploy();
    await syncVault.waitForDeployment();
    const newSyncVaultAddr = await syncVault.getAddress();
    console.log(`✅ New SyncVault Template deployed at: ${newSyncVaultAddr}`);
    console.log("Sleeping 10s for transaction propagation...");
    await sleep(10000);

    // 2. Deploy Updated AsyncVault Template
    console.log(`\n>>> [2/4] Deploying Updated AsyncVault Template...`);
    const AsyncVaultFactory = await ethers.getContractFactory("AsyncVault");
    const asyncVault = await AsyncVaultFactory.deploy();
    await asyncVault.waitForDeployment();
    const newAsyncVaultAddr = await asyncVault.getAddress();
    console.log(`✅ New AsyncVault Template deployed at: ${newAsyncVaultAddr}`);
    console.log("Sleeping 10s for transaction propagation...");
    await sleep(10000);

    // 3. Update Templates in VaultFactory
    if (contracts.vaultFactory && contracts.vaultFactory !== ethers.ZeroAddress) {
        console.log(`\n>>> [3/4] Updating Templates in VaultFactory at ${contracts.vaultFactory}...`);
        const vaultFactory = await ethers.getContractAt("VaultFactory", contracts.vaultFactory);

        console.log(`Setting new SyncVault template in VaultFactory...`);
        const tx1 = await vaultFactory.setSyncVaultTemplate(newSyncVaultAddr);
        console.log(`Tx submitted: ${tx1.hash}. Waiting for confirmation...`);
        await tx1.wait();
        console.log(`✅ VaultFactory SyncVault template updated to ${newSyncVaultAddr}`);
        await sleep(5000);

        console.log(`Setting new AsyncVault template in VaultFactory...`);
        const tx2 = await vaultFactory.setAsyncVaultTemplate(newAsyncVaultAddr);
        console.log(`Tx submitted: ${tx2.hash}. Waiting for confirmation...`);
        await tx2.wait();
        console.log(`✅ VaultFactory AsyncVault template updated to ${newAsyncVaultAddr}`);
        await sleep(5000);
    } else {
        console.log(`⚠️ VaultFactory not found in deployment.json, skipping template link.`);
    }

    // 4. Update deployment.json
    console.log(`\n>>> [4/4] Updating deployments/sepolia-deployment.json...`);
    contracts.syncVaultTemplate = newSyncVaultAddr;
    contracts.asyncVaultTemplate = newAsyncVaultAddr;
    deployment.timestamp = new Date().toISOString();

    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2), "utf8");
    console.log(`✅ Updated ${deploymentPath} successfully.`);

    console.log("\n================================================================================");
    console.log("🎉 DEPLOYMENT AND CONFIGURATION COMPLETE!");
    console.log(`   SyncVault Template:  ${newSyncVaultAddr}`);
    console.log(`   AsyncVault Template: ${newAsyncVaultAddr}`);
    console.log("================================================================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
