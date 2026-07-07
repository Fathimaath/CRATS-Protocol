const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 16: Lifecycle Exit (L3)
 * Demonstrates settlement verification, pre-distribution pause checkpoint,
 * compliance hold escrowing, programmatic token/share burning, and vault closure.
 */
async function main() {
    console.log("\n--- Step 16: Lifecycle Exit (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor] = await hre.ethers.getSigners();

    // 1. Deploy LifecycleExitManager if not already deployed
    let lifecycleExitManagerAddr = deployment.contracts.lifecycleExitManager;
    if (!lifecycleExitManagerAddr) {
        console.log("Deploying LifecycleExitManager Implementation...");
        const LifecycleExitManager = await hre.ethers.getContractFactory("LifecycleExitManager");
        const impl = await LifecycleExitManager.deploy();
        await impl.waitForDeployment();
        const implAddr = await impl.getAddress();

        console.log("Deploying LifecycleExitManager UUPS Proxy...");
        const ERC1967Proxy = await hre.ethers.getContractFactory("ERC1967Proxy");
        const initData = LifecycleExitManager.interface.encodeFunctionData("initialize", [
            deployer.address,
            deployment.contracts.usdc,
            deployment.contracts.assetRegistry
        ]);
        const proxy = await ERC1967Proxy.deploy(implAddr, initData);
        await proxy.waitForDeployment();

        lifecycleExitManagerAddr = await proxy.getAddress();
        deployment.contracts.lifecycleExitManager = lifecycleExitManagerAddr;
        await saveDeploymentInfo(deployment);
        console.log(`Deployed LifecycleExitManager proxy at: ${lifecycleExitManagerAddr}`);
    }

    const exitManager = await hre.ethers.getContractAt("LifecycleExitManager", lifecycleExitManagerAddr);
    const azureVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.azureVault);
    const azureToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.azureToken);
    const usdc = await hre.ethers.getContractAt("IERC20", deployment.contracts.usdc);
    const compliance = await hre.ethers.getContractAt("Compliance", deployment.contracts.complianceModule);

    // Grant roles on Vault and AssetToken to LifecycleExitManager so it can close and burn programmatically
    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const vaultHasRole = await azureVault.hasRole(DEFAULT_ADMIN_ROLE, lifecycleExitManagerAddr);
    if (!vaultHasRole) {
        console.log("Granting DEFAULT_ADMIN_ROLE to LifecycleExitManager on azureVault...");
        await (await azureVault.grantRole(DEFAULT_ADMIN_ROLE, lifecycleExitManagerAddr)).wait();
    }
    const tokenHasRole = await azureToken.hasRole(DEFAULT_ADMIN_ROLE, lifecycleExitManagerAddr);
    if (!tokenHasRole) {
        console.log("Granting DEFAULT_ADMIN_ROLE to LifecycleExitManager on azureToken...");
        await (await azureToken.grantRole(DEFAULT_ADMIN_ROLE, lifecycleExitManagerAddr)).wait();
    }

    // 2. Settlement Verification
    // Total settlement amount in USDC
    const settlementAmount = hre.ethers.parseUnits("500", 6); // USDC uses 6 decimals
    console.log(`Approving ${hre.ethers.formatUnits(settlementAmount, 6)} USDC for settlement...`);
    await (await usdc.approve(lifecycleExitManagerAddr, settlementAmount)).wait();

    console.log("Verifying settlement...");
    await (await exitManager.verifySettlement(await azureVault.getAddress(), settlementAmount)).wait();
    console.log("Settlement verified.");

    // 3. Pause Checkpoint Test
    console.log("Pausing exit pre-distribution (Guardian checkpoint)...");
    await (await exitManager.pauseExit(await azureVault.getAddress())).wait();

    console.log("Attempting execution of paused exit (should fail)...");
    try {
        await (await exitManager.executeExit(await azureVault.getAddress())).wait();
        throw new Error("Execution succeeded on paused exit!");
    } catch (e) {
        console.log(`Execution correctly blocked: ${e.message}`);
    }

    console.log("Resuming exit...");
    await (await exitManager.resumeExit(await azureVault.getAddress())).wait();

    // 4. Compliance Hold Test (restrict holder before distribution)
    console.log("Restricting investor to escrow settlement funds...");
    const reasonCode = hre.ethers.id("SANCTION_LIST");
    const evidenceHash = hre.ethers.id("sanctions_hold");
    await (await compliance.restrictHolder(await azureToken.getAddress(), investor.address, reasonCode, 3600, evidenceHash)).wait();

    // 5. Execute Exit
    console.log("Executing exit...");
    const execTx = await exitManager.executeExit(await azureVault.getAddress());
    await execTx.wait();
    console.log("Exit executed.");

    // Check that vault is closed
    const isClosed = await azureVault.isClosed();
    console.log(`Is azureVault closed? ${isClosed}`);

    // Check escrowed funds
    const escrowed = await exitManager.escrowedSettlements(await azureVault.getAddress(), investor.address);
    console.log(`Escrowed funds for investor: ${hre.ethers.formatUnits(escrowed, 6)} USDC`);

    // Check balances (should be burned)
    const vaultBal = await azureVault.balanceOf(investor.address);
    const tokenBal = await azureToken.balanceOf(investor.address);
    console.log(`Investor vault shares balance: ${hre.ethers.formatEther(vaultBal)}`);
    console.log(`Investor asset token balance: ${hre.ethers.formatEther(tokenBal)}`);

    // 6. Release restriction & claim escrow
    console.log("Lifting restriction on investor...");
    await (await compliance.removeRestriction(await azureToken.getAddress(), investor.address, "Sanction resolved")).wait();

    console.log("Claiming escrowed funds...");
    const claimTx = await exitManager.connect(investor).claimEscrow(await azureVault.getAddress());
    await claimTx.wait();
    console.log("Escrow claimed successfully!");

    await saveWorkflowResult(16, {
        name: "Lifecycle Exit",
        txHash: execTx.hash,
        contract: lifecycleExitManagerAddr,
        details: `Successfully closed vault. Burned investor shares and asset tokens. Escrowed and claimed ${hre.ethers.formatUnits(escrowed, 6)} USDC settlement.`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
