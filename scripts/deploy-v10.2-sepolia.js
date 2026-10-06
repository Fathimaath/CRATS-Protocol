const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("================================================================================");
    console.log("   CRATS PROTOCOL v10.2.0 — SEPOLIA DEPLOYMENT & COMPLETE WIRING");
    console.log("================================================================================");

    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;

    if (network !== "sepolia") {
        throw new Error("This deployment script must be run on the sepolia network");
    }

    console.log(`Deployer Address: ${deployer.address}`);
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Sepolia ETH Balance: ${hre.ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        throw new Error("Deployer account has 0 ETH on Sepolia.");
    }

    const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia-deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("Sepolia deployment file not found at " + deploymentPath);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const deployed = deployment.contracts;

    const treasuryAddress = "0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d";
    console.log(`Treasury Address:  ${treasuryAddress}`);
    console.log(`USDC Address:      ${deployed.usdc}`);
    console.log(`AssetRegistry:     ${deployed.assetRegistry}`);
    console.log(`NAV Oracle:        ${deployed.navOracle}`);
    console.log(`FeeEngine:         ${deployed.feeEngine}`);

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
            overrides.gasPrice = feeData.gasPrice
                ? (feeData.gasPrice * 150n) / 100n
                : hre.ethers.parseUnits("30", "gwei");
        }
        if (feeData.maxPriorityFeePerGas) {
            overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n;
        }
        return overrides;
    }

    // =========================================================================
    // 1. Deploy Updated SyncVault Template
    // =========================================================================
    console.log("\n>>> [1/5] Deploying Updated SyncVault Template (Dual NAV mode, protected setters)...");
    await waitForMempool();
    const SyncVaultFactory = await hre.ethers.getContractFactory("SyncVault");
    const syncVault = await SyncVaultFactory.deploy(await getOverrides());
    await syncVault.waitForDeployment();
    const newSyncVaultAddr = await syncVault.getAddress();
    console.log(`✅ New SyncVault Template: ${newSyncVaultAddr}`);
    await sleep(5000);

    // =========================================================================
    // 2. Deploy Updated AsyncVault Template
    // =========================================================================
    console.log("\n>>> [2/5] Deploying Updated AsyncVault Template (AUD-03 NAV validation, FeeEngine)...");
    await waitForMempool();
    const AsyncVaultFactory = await hre.ethers.getContractFactory("AsyncVault");
    const asyncVault = await AsyncVaultFactory.deploy(await getOverrides());
    await asyncVault.waitForDeployment();
    const newAsyncVaultAddr = await asyncVault.getAddress();
    console.log(`✅ New AsyncVault Template: ${newAsyncVaultAddr}`);
    await sleep(5000);

    // =========================================================================
    // 3. Deploy Updated RedemptionManager (Last-investor gate relief)
    // =========================================================================
    console.log("\n>>> [3/5] Deploying Updated RedemptionManager (Last-investor gate relief)...");
    await waitForMempool();
    const RedemptionManagerFactory = await hre.ethers.getContractFactory("RedemptionManager");
    const redemptionManager = await RedemptionManagerFactory.deploy(deployer.address, await getOverrides());
    await redemptionManager.waitForDeployment();
    const newRmAddr = await redemptionManager.getAddress();
    console.log(`✅ New RedemptionManager: ${newRmAddr}`);
    await sleep(5000);

    console.log("Configuring RedemptionManager dependencies...");
    await waitForMempool();
    await (await redemptionManager.setAssetRegistry(deployed.assetRegistry, await getOverrides())).wait();
    console.log("  - AssetRegistry configured");

    await waitForMempool();
    await (await redemptionManager.setOwnershipSyncManager(deployed.syncManager, await getOverrides())).wait();
    console.log("  - OwnershipSyncManager configured");

    await waitForMempool();
    await (await redemptionManager.setNavOracle(deployed.navOracle, await getOverrides())).wait();
    console.log("  - NavOracle configured");

    // =========================================================================
    // 4. Deploy Updated VaultFactory (Auto-wiring defaults)
    // =========================================================================
    console.log("\n>>> [4/5] Deploying Updated VaultFactory (Automatic default wiring)...");
    await waitForMempool();
    const VaultFactoryContract = await hre.ethers.getContractFactory("VaultFactory");
    const vaultFactory = await VaultFactoryContract.deploy(deployer.address, await getOverrides());
    await vaultFactory.waitForDeployment();
    const newVaultFactoryAddr = await vaultFactory.getAddress();
    console.log(`✅ New VaultFactory: ${newVaultFactoryAddr}`);
    await sleep(5000);

    console.log("Configuring VaultFactory templates and links...");
    await waitForMempool();
    await (await vaultFactory.setSyncVaultTemplate(newSyncVaultAddr, await getOverrides())).wait();
    console.log("  - SyncVault template set");

    await waitForMempool();
    await (await vaultFactory.setAsyncVaultTemplate(newAsyncVaultAddr, await getOverrides())).wait();
    console.log("  - AsyncVault template set");

    if (deployed.identityRegistry) {
        await waitForMempool();
        await (await vaultFactory.setIdentityRegistry(deployed.identityRegistry, await getOverrides())).wait();
        console.log("  - IdentityRegistry set");
    }

    if (deployed.complianceModule) {
        await waitForMempool();
        await (await vaultFactory.setComplianceModule(deployed.complianceModule, await getOverrides())).wait();
        console.log("  - ComplianceModule set");
    }

    if (deployed.circuitBreaker) {
        await waitForMempool();
        await (await vaultFactory.setCircuitBreakerModule(deployed.circuitBreaker, await getOverrides())).wait();
        console.log("  - CircuitBreaker set");
    }

    if (deployed.yieldDistributor) {
        await waitForMempool();
        await (await vaultFactory.setYieldDistributor(deployed.yieldDistributor, await getOverrides())).wait();
        console.log("  - YieldDistributor set");
    }

    if (deployed.syncManager) {
        await waitForMempool();
        await (await vaultFactory.setSyncManager(deployed.syncManager, await getOverrides())).wait();
        console.log("  - SyncManager set");
    }

    await waitForMempool();
    await (await vaultFactory.setRedemptionManager(newRmAddr, await getOverrides())).wait();
    console.log("  - RedemptionManager set");

    if (deployed.assetFactory) {
        await waitForMempool();
        await (await vaultFactory.setAssetFactory(deployed.assetFactory, await getOverrides())).wait();
        console.log("  - AssetFactory set");

        // Grant VAULT_FACTORY_ROLE on AssetFactory
        try {
            await waitForMempool();
            const assetFactoryContract = await hre.ethers.getContractAt("AssetFactory", deployed.assetFactory);
            const VAULT_FACTORY_ROLE = hre.ethers.id("VAULT_FACTORY_ROLE");
            await (await assetFactoryContract.grantRole(VAULT_FACTORY_ROLE, newVaultFactoryAddr, await getOverrides())).wait();
            console.log("  - Granted VAULT_FACTORY_ROLE on AssetFactory");
        } catch (err) {
            console.warn(`  ⚠️ Could not grant VAULT_FACTORY_ROLE on AssetFactory: ${err.message}`);
        }
    }

    // Set Protocol Defaults on VaultFactory
    await waitForMempool();
    await (await vaultFactory.setProtocolDefaults(
        treasuryAddress,
        deployed.navOracle,
        deployed.feeEngine,
        await getOverrides()
    )).wait();
    console.log("  - Protocol Defaults configured (Treasury, NavOracle, FeeEngine)");

    // =========================================================================
    // 5. Deploy Updated LifecycleExitManager (Correct wiring, batching, sweep)
    // =========================================================================
    console.log("\n>>> [5/5] Deploying Updated LifecycleExitManager (Correct parameter order, batching, escrow sweep)...");
    await waitForMempool();
    const LEMFactory = await hre.ethers.getContractFactory("LifecycleExitManager");
    const lemImpl = await LEMFactory.deploy(await getOverrides());
    await lemImpl.waitForDeployment();
    const lemImplAddr = await lemImpl.getAddress();
    console.log(`  - Implementation deployed at: ${lemImplAddr}`);
    await sleep(5000);

    await waitForMempool();
    const ERC1967Proxy = await hre.ethers.getContractFactory("ERC1967Proxy");
    const initData = LEMFactory.interface.encodeFunctionData("initialize", [
        deployer.address,
        deployed.usdc,          // Correct USDC address
        deployed.assetRegistry  // Correct AssetRegistry address
    ]);
    const lemProxy = await ERC1967Proxy.deploy(lemImplAddr, initData, await getOverrides());
    await lemProxy.waitForDeployment();
    const newLemAddr = await lemProxy.getAddress();
    console.log(`✅ New LifecycleExitManager Proxy: ${newLemAddr}`);
    await sleep(5000);

    const lemContract = await hre.ethers.getContractAt("LifecycleExitManager", newLemAddr);

    // Verify configured parameters on-chain
    const verifiedUsdc = await lemContract.usdc();
    const verifiedRegistry = await lemContract.assetRegistry();
    const verifiedBPS = await lemContract.settlementVarianceBPS();
    console.log(`  - Verified on-chain USDC:          ${verifiedUsdc}`);
    console.log(`  - Verified on-chain AssetRegistry: ${verifiedRegistry}`);
    console.log(`  - Verified settlementVarianceBPS:  ${verifiedBPS}`);

    if (verifiedUsdc.toLowerCase() !== deployed.usdc.toLowerCase()) {
        throw new Error("FATAL: USDC address mismatch on deployed LEM!");
    }
    if (verifiedRegistry.toLowerCase() !== deployed.assetRegistry.toLowerCase()) {
        throw new Error("FATAL: AssetRegistry address mismatch on deployed LEM!");
    }

    // Configure links on LifecycleExitManager
    await waitForMempool();
    await (await lemContract.setNavOracle(deployed.navOracle, await getOverrides())).wait();
    console.log("  - NavOracle linked");

    await waitForMempool();
    await (await lemContract.setRedemptionManager(newRmAddr, await getOverrides())).wait();
    console.log("  - RedemptionManager linked");

    await waitForMempool();
    await (await lemContract.setOwnershipSyncManager(deployed.syncManager, await getOverrides())).wait();
    console.log("  - OwnershipSyncManager linked");

    await waitForMempool();
    await (await lemContract.setTreasury(treasuryAddress, await getOverrides())).wait();
    console.log("  - Treasury linked");

    // =========================================================================
    // 6. Update deployments/sepolia-deployment.json
    // =========================================================================
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

    console.log("\n================================================================================");
    console.log("🎉 ALL CONTRACTS DEPLOYED, LINKED, AND VERIFIED ON ETHEREUM SEPOLIA!");
    console.log(`   SyncVault Template:     ${newSyncVaultAddr}`);
    console.log(`   AsyncVault Template:    ${newAsyncVaultAddr}`);
    console.log(`   VaultFactory:           ${newVaultFactoryAddr}`);
    console.log(`   RedemptionManager:      ${newRmAddr}`);
    console.log(`   LifecycleExitManager:   ${newLemAddr}`);
    console.log("================================================================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
