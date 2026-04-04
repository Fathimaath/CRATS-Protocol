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
    
    // Simulate rental income: $1,000
    const income = hre.ethers.parseEther("1000");
    
    console.log("Distributing rental income ($1,000)...");
    // This typically push yield to the vault, increasing share price
    // Note: distributeYieldToVault assumes the caller has DISTRIBUTOR_ROLE
    const tx = await yieldDistributor.distributeYieldToVault(
        deployment.contracts.azureVault,
        income,
        hre.ethers.ZeroHash // One-time distribution
    );
    await tx.wait();

    console.log("✅ Yield distributed. Share price increased.");

    await saveWorkflowResult(12, {
        name: "Yield Distribution",
        txHash: distTx.hash || syncTx.hash,
        contract: deployment.contracts.azureVault,
        details: `Distributed 500 AZURE yield to vault`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
