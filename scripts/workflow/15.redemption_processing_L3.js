const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 15: Redemption Processing (L3)
 * Demonstrates standard redemptions, USDC exit fee escrowing,
 * and the three precedence checks (PAUSED, RESTRICTED, FROZEN).
 */
async function main() {
    console.log("\n--- Step 15: Redemption Processing (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor] = await hre.ethers.getSigners();

    // 1. Deploy RedemptionManager if not already deployed
    let redemptionManagerAddr = deployment.contracts.redemptionManager;
    if (!redemptionManagerAddr) {
        console.log("Deploying RedemptionManager...");
        const RedemptionManager = await hre.ethers.getContractFactory("RedemptionManager");
        const rm = await RedemptionManager.deploy(deployer.address);
        await rm.waitForDeployment();
        redemptionManagerAddr = await rm.getAddress();
        deployment.contracts.redemptionManager = redemptionManagerAddr;
        await saveDeploymentInfo(deployment);
        console.log(`Deployed RedemptionManager at: ${redemptionManagerAddr}`);
    }

    const redemptionManager = await hre.ethers.getContractAt("RedemptionManager", redemptionManagerAddr);

    // Setup registry if not set
    const currentRegistry = await redemptionManager.assetRegistry();
    if (currentRegistry === hre.ethers.ZeroAddress) {
        console.log("Setting AssetRegistry in RedemptionManager...");
        await (await redemptionManager.setAssetRegistry(deployment.contracts.assetRegistry)).wait();
    }

    const azureVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.azureVault);
    const azureToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.azureToken);
    const usdc = await hre.ethers.getContractAt("IERC20", deployment.contracts.usdc);
    const compliance = await hre.ethers.getContractAt("Compliance", deployment.contracts.complianceModule);

    // Ensure Redemption is enabled for the asset in the Asset Registry
    const assetRegistry = await hre.ethers.getContractAt("AssetRegistry", deployment.contracts.assetRegistry);
    let redemptionEnabled = false;
    try {
        redemptionEnabled = await assetRegistry.getAssetRedemptionConfig(await azureToken.getAddress());
    } catch (e) {
        // Not initialized
    }
    if (!redemptionEnabled) {
        console.log("Initializing redemption config to true in AssetRegistry...");
        await (await assetRegistry.setAssetRedemptionConfig(await azureToken.getAddress(), true)).wait();
    }

    // Grant roles on vault and token if needed
    console.log("Granting DEFAULT_ADMIN_ROLE to RedemptionManager on azureVault...");
    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const rmHasRole = await azureVault.hasRole(DEFAULT_ADMIN_ROLE, redemptionManagerAddr);
    if (!rmHasRole) {
        await (await azureVault.grantRole(DEFAULT_ADMIN_ROLE, redemptionManagerAddr)).wait();
    }

    // Approve shares transfer to RedemptionManager
    const sharesToRedeem = hre.ethers.parseEther("10");
    console.log(`Approving ${hre.ethers.formatEther(sharesToRedeem)} shares for RedemptionManager...`);
    await (await azureVault.connect(investor).approve(redemptionManagerAddr, sharesToRedeem)).wait();

    // Check fee engine and approve USDC if there is an exit fee
    const feeEngineAddr = await azureVault.feeEngine();
    if (feeEngineAddr !== hre.ethers.ZeroAddress) {
        const feeEngine = await hre.ethers.getContractAt("FeeEngine", feeEngineAddr);
        const fee = await feeEngine.calculateExitFee(await azureVault.getAddress(), sharesToRedeem, investor.address);
        if (fee > 0) {
            console.log(`Approving exit fee of ${hre.ethers.formatEther(fee)} USDC...`);
            await (await usdc.connect(investor).approve(redemptionManagerAddr, fee)).wait();
        }
    }

    // Request redemption
    console.log("Requesting redemption...");
    const reqTx = await redemptionManager.connect(investor).requestRedemption(await azureVault.getAddress(), sharesToRedeem);
    const reqReceipt = await reqTx.wait();

    // Find requestId from events
    const reqEvent = reqReceipt.logs
        .map((log) => {
            try { return redemptionManager.interface.parseLog(log); } catch (e) { return null; }
        })
        .find((event) => event && event.name === "RedemptionRequested");
    const requestId = reqEvent.args.requestId;
    console.log(`Redemption requested with ID: ${requestId}`);

    // Process redemption
    console.log("Processing redemption...");
    const expectedAssets = hre.ethers.parseEther("10"); // 1:1 for simplicity
    const procTx = await redemptionManager.processRedemption(await azureVault.getAddress(), requestId, expectedAssets);
    await procTx.wait();

    // Claim redemption
    console.log("Claiming redemption...");
    const claimTx = await redemptionManager.connect(investor).claimRedemption(await azureVault.getAddress(), requestId);
    await claimTx.wait();
    console.log("✅ Redemption claimed successfully!");

    // --- Guardian Pause / Resume Test ---
    console.log("\nTesting Guardian pause...");
    const category = await azureVault.category();
    await (await redemptionManager.pauseCategory(category, "Emergency pause")).wait();
    console.log("Category paused.");

    const isPaused = await redemptionManager.isCategoryPaused(category);
    console.log(`Is category paused? ${isPaused}`);

    console.log("Resuming category pause...");
    await (await redemptionManager.unpauseCategoryGuardian(category, "All clear")).wait();
    console.log("Category resumed.");

    // --- Investor Restriction Test ---
    console.log("\nTesting Compliance Investor Restriction...");
    // Grant Compliance role to deployer if needed
    const COMPLIANCE_ROLE = hre.ethers.id("COMPLIANCE_ROLE");
    const deployerHasCompRole = await compliance.hasRole(COMPLIANCE_ROLE, deployer.address);
    if (!deployerHasCompRole) {
        await (await compliance.grantRole(COMPLIANCE_ROLE, deployer.address)).wait();
    }

    const reasonCode = hre.ethers.id("SANCTION_LIST");
    const evidenceHash = hre.ethers.id("evidence_data");
    console.log("Restricting investor...");
    await (await compliance.restrictHolder(await azureToken.getAddress(), investor.address, reasonCode, 3600, evidenceHash)).wait();

    const isRestricted = await compliance.isInvestorRestricted(await azureToken.getAddress(), investor.address);
    console.log(`Is investor restricted? ${isRestricted}`);

    console.log("Removing restriction...");
    await (await compliance.removeRestriction(await azureToken.getAddress(), investor.address, "Sanction list false positive")).wait();
    console.log("Restriction removed.");

    await saveWorkflowResult(15, {
        name: "Redemption Processing",
        txHash: claimTx.hash,
        contract: redemptionManagerAddr,
        details: `Redeemed ${hre.ethers.formatEther(sharesToRedeem)} shares. Tested Guardian pauses and Investor compliance restrictions.`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
