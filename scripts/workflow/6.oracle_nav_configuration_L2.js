const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 6: Oracle / NAV Configuration (L2)
 * Sets initial NAV for Azure Manor.
 */
async function main() {
    console.log("\n--- Step 6: Oracle / NAV Configuration (L2) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    if (!deployment.contracts.azureToken) {
        throw new Error("Azure Token not deployed. Run Step 4 first.");
    }

    const assetOracle = await hre.ethers.getContractAt("AssetOracle", deployment.contracts.assetOracle);
    
    // Set NAV: $1.00 per token = $10M total
    const nav = hre.ethers.parseUnits("1.00", 18);
    
    console.log("Proposing NAV update to $1.00...");
    const tx = await assetOracle.proposeNAV(deployment.contracts.azureToken, nav);
    await tx.wait();

    console.log("Approving NAV update (Simulation)...");
    // In multi-sig, other signers would call this. Here admin approves.
    const approveTx = await assetOracle.approveNAV(deployment.contracts.azureToken, 0); // index 0
    await approveTx.wait();

    console.log("✅ NAV configured successfully.");

    await saveWorkflowResult(6, {
        name: "Oracle / NAV Config",
        txHash: receipt.hash || tx.hash,
        contract: deployment.contracts.azureToken,
        details: `NAV: $1,200/share, Source: RICS Appraisal`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
