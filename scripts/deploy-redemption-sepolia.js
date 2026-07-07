const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("==================================================");
    console.log("   CRATS Redemption Module Sepolia Deployment & Upgrade");
    console.log("==================================================\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    if (network !== "sepolia") {
        throw new Error("This script must be run on the sepolia network");
    }

    console.log("Deployer Address:", deployer.address);
    console.log("Network:", network);
    console.log("Chain ID:", chainId);

    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);
    if (!fs.existsSync(deploymentFile)) {
        throw new Error(`Deployment file not found at ${deploymentFile}`);
    }

    const data = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const L1 = data.contracts;
    const L2 = data.contracts;
    const L3 = data.contracts;

    // Helper to wait until there are no pending transactions for the deployer address
    async function waitForMempool() {
        let latest = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
        let pending = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
        if (pending > latest) {
            console.log(`⏳ Waiting for ${pending - latest} pending transaction(s) to mine...`);
            while (pending > latest) {
                await new Promise(r => setTimeout(r, 5000));
                latest = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
                pending = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
            }
            console.log("✅ Mempool clear. Proceeding.");
        }
    }

    async function getOverrides() {
        const feeData = await hre.ethers.provider.getFeeData();
        const overrides = {};
        if (feeData.maxFeePerGas) {
            overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n; // 50% buffer
        } else {
            overrides.gasPrice = feeData.gasPrice ? (feeData.gasPrice * 150n) / 100n : hre.ethers.parseUnits("30", "gwei");
        }
        if (feeData.maxPriorityFeePerGas) {
            overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n; // 50% buffer
        }
        return overrides;
    }

    // 1. Upgrade AssetRegistry proxy
    await waitForMempool();
    console.log("\n>>> Upgrading AssetRegistry proxy...");
    const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
    const upgradedRegistry = await hre.upgrades.upgradeProxy(L2.assetRegistry, AssetRegistry, {
        kind: "uups",
        txOverrides: await getOverrides()
    });
    await upgradedRegistry.waitForDeployment();
    console.log("  ✅ AssetRegistry upgraded at:", L2.assetRegistry);

    // 2. Upgrade Compliance proxy
    await waitForMempool();
    console.log("\n>>> Upgrading Compliance proxy...");
    const Compliance = await hre.ethers.getContractFactory("Compliance");
    const upgradedCompliance = await hre.upgrades.upgradeProxy(L1.complianceModule, Compliance, {
        kind: "uups",
        txOverrides: await getOverrides()
    });
    await upgradedCompliance.waitForDeployment();
    console.log("  ✅ Compliance upgraded at:", L1.complianceModule);

    // 3. Deploy new AssetToken logic template
    await waitForMempool();
    console.log("\n>>> Deploying new AssetToken logic template...");
    const AssetToken = await hre.ethers.getContractFactory("AssetToken");
    const tokenImpl = await AssetToken.deploy(await getOverrides());
    await tokenImpl.waitForDeployment();
    const tokenImplAddr = await tokenImpl.getAddress();
    console.log("  ✅ AssetToken template deployed at:", tokenImplAddr);

    // 4. Update template in AssetFactory
    await waitForMempool();
    console.log("\n>>> Updating AssetToken template in AssetFactory...");
    const assetFactory = await hre.ethers.getContractAt("AssetFactory", L2.assetFactory);
    const setTokenTemplateTx = await assetFactory.setAssetTokenTemplate(tokenImplAddr, await getOverrides());
    await setTokenTemplateTx.wait();
    console.log("  ✅ Template updated in AssetFactory");

    // 5. Deploy new SyncVault logic template
    await waitForMempool();
    console.log("\n>>> Deploying new SyncVault logic template...");
    const SyncVault = await hre.ethers.getContractFactory("SyncVault");
    const syncVaultImpl = await SyncVault.deploy(await getOverrides());
    await syncVaultImpl.waitForDeployment();
    const syncVaultImplAddr = await syncVaultImpl.getAddress();
    console.log("  ✅ SyncVault template deployed at:", syncVaultImplAddr);

    // 6. Update template in VaultFactory
    await waitForMempool();
    console.log("\n>>> Updating SyncVault template in VaultFactory...");
    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", L3.vaultFactory);
    const setSyncTemplateTx = await vaultFactory.setSyncVaultTemplate(syncVaultImplAddr, await getOverrides());
    await setSyncTemplateTx.wait();
    console.log("  ✅ SyncVault template updated in VaultFactory");

    // 7. Deploy new AsyncVault logic template
    await waitForMempool();
    console.log("\n>>> Deploying new AsyncVault logic template...");
    const AsyncVault = await hre.ethers.getContractFactory("AsyncVault");
    const asyncVaultImpl = await AsyncVault.deploy(await getOverrides());
    await asyncVaultImpl.waitForDeployment();
    const asyncVaultImplAddr = await asyncVaultImpl.getAddress();
    console.log("  ✅ AsyncVault template deployed at:", asyncVaultImplAddr);

    // 8. Update template in VaultFactory
    await waitForMempool();
    console.log("\n>>> Updating AsyncVault template in VaultFactory...");
    const setAsyncTemplateTx = await vaultFactory.setAsyncVaultTemplate(asyncVaultImplAddr, await getOverrides());
    await setAsyncTemplateTx.wait();
    console.log("  ✅ AsyncVault template updated in VaultFactory");

    // 9. Deploy RedemptionManager
    await waitForMempool();
    console.log("\n>>> Deploying RedemptionManager...");
    const RedemptionManager = await hre.ethers.getContractFactory("RedemptionManager");
    const rm = await RedemptionManager.deploy(deployer.address, await getOverrides());
    await rm.waitForDeployment();
    const rmAddr = await rm.getAddress();
    console.log("  ✅ RedemptionManager deployed at:", rmAddr);

    // Link AssetRegistry to RedemptionManager
    await waitForMempool();
    console.log("\n>>> Configuring AssetRegistry on RedemptionManager...");
    const setRegTx = await rm.setAssetRegistry(L2.assetRegistry, await getOverrides());
    await setRegTx.wait();
    console.log("  ✅ AssetRegistry set in RedemptionManager");

    // 10. Deploy LifecycleExitManager
    await waitForMempool();
    console.log("\n>>> Deploying LifecycleExitManager (Proxy)...");
    const LifecycleExitManager = await hre.ethers.getContractFactory("LifecycleExitManager");
    const exitProxy = await hre.upgrades.deployProxy(LifecycleExitManager, [deployer.address, deployer.address, L3.usdc], {
        kind: "uups",
        txOverrides: await getOverrides()
    });
    await exitProxy.waitForDeployment();
    const exitAddr = await exitProxy.getAddress();
    console.log("  ✅ LifecycleExitManager deployed at:", exitAddr);

    // Save deployed contract addresses
    data.contracts.assetTokenTemplate = tokenImplAddr;
    data.contracts.syncVaultTemplate = syncVaultImplAddr;
    data.contracts.asyncVaultTemplate = asyncVaultImplAddr;
    data.contracts.redemptionManager = rmAddr;
    data.contracts.lifecycleExitManager = exitAddr;

    fs.writeFileSync(deploymentFile, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved updated addresses to ${path.basename(deploymentFile)}`);
    console.log("\n🎉 DEPLOYMENT COMPLETE!");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
