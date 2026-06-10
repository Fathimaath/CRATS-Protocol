const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 12: Yield Distribution (L3)
 * Distributes rental income to vault holders.
 */
async function main() {
    console.log("\n--- Step 12: Yield Distribution (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    const yieldDistributor = await hre.ethers.getContractAt("YieldDistributor", deployment.contracts.yieldDistributor);
    const azureToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.azureToken);
    const azureVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.azureVault);

    // Ensure YieldDistributor has OPERATOR_ROLE on the vault to call distributeYield
    // Note: The vault admin is the issuer (msg.sender during vault creation), not the deployer
    const operatorRole = hre.ethers.id("OPERATOR_ROLE");
    const isOperator = await azureVault.hasRole(operatorRole, deployment.contracts.yieldDistributor);
    if (!isOperator) {
        console.log("Granting OPERATOR_ROLE to YieldDistributor on Azure Vault (signed by issuer/vault admin)...");
        await (await azureVault.connect(issuer).grantRole(operatorRole, deployment.contracts.yieldDistributor)).wait();
        console.log("✅ OPERATOR_ROLE granted to YieldDistributor.");
    } else {
        console.log("ℹ️ YieldDistributor already has OPERATOR_ROLE on vault.");
    }

    // Register and verify YieldDistributor in IdentityRegistry
    // It acts as an intermediary token recipient during distributeYieldToVault so must pass compliance
    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    const existingYDTokenId = await identitySBT.tokenIdOf(deployment.contracts.yieldDistributor);
    if (existingYDTokenId === 0n || existingYDTokenId === 0) {
        console.log("Registering YieldDistributor in IdentityRegistry for compliance...");
        const roleInstitutional = 3;
        const jurisdiction = 826;
        const did = `did:crats:yield-distributor-${deployment.contracts.yieldDistributor.toLowerCase()}`;
        const didHash = hre.ethers.id(did);
        const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);
        
        await (await identityRegistry.connect(deployer).registerIdentity(
            deployment.contracts.yieldDistributor,
            roleInstitutional,
            jurisdiction,
            didHash,
            did,
            expiresAt
        )).wait();
        
        const ydTokenId = await identitySBT.tokenIdOf(deployment.contracts.yieldDistributor);
        await (await identitySBT.connect(deployer).updateStatus(ydTokenId, 2)).wait();
        console.log("✅ YieldDistributor verified in IdentityRegistry.");
    } else {
        console.log("ℹ️ YieldDistributor already registered in IdentityRegistry.");
    }

    // Simulate rental income: $1,000
    const income = hre.ethers.parseEther("1000");

    // Check if the schedule already exists, otherwise create it
    let scheduleId;
    const scheduleIds = await yieldDistributor.getVaultScheduleIds(deployment.contracts.azureVault);
    if (scheduleIds.length > 0) {
        scheduleId = scheduleIds[0];
        console.log(`ℹ️ Yield schedule already exists with ID: ${scheduleId}`);
    } else {
        console.log("Creating a yield schedule for Azure Manor Vault...");
        const createTx = await yieldDistributor.connect(deployer).createYieldSchedule(
            deployment.contracts.azureVault,
            "Monthly Rent",
            deployment.contracts.azureToken,
            income,
            30 * 24 * 60 * 60, // 30 days
            0 // RENTAL_INCOME
        );
        const receipt = await createTx.wait();
        const event = receipt.logs.find(log => {
            try {
                return yieldDistributor.interface.parseLog(log).name === "YieldScheduleCreated";
            } catch (e) {
                return false;
            }
        });
        scheduleId = yieldDistributor.interface.parseLog(event).args.scheduleId;
        console.log(`✅ Yield schedule created with ID: ${scheduleId}`);
    }

    console.log("Approving YieldDistributor to spend AZURE from issuer...");
    await (await azureToken.connect(issuer).approve(deployment.contracts.yieldDistributor, income)).wait();

    console.log("Distributing rental income ($1,000)...");
    const tx = await yieldDistributor.connect(issuer).distributeYieldToVault(
        deployment.contracts.azureVault,
        income,
        scheduleId
    );
    const receipt = await tx.wait();

    console.log("✅ Yield distributed. Share price increased.");

    await saveWorkflowResult(12, {
        name: "Yield Distribution",
        txHash: receipt.hash || tx.hash,
        contract: deployment.contracts.azureVault,
        details: `Distributed 1,000 AZURE yield to vault`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
