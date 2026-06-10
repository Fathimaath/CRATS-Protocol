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

    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);
    const assetId = hre.ethers.zeroPadValue(deployment.contracts.azureToken, 32);
    
    // Set NAV: $1.00 per token
    const nav = hre.ethers.parseUnits("1.00", 18);
    
    console.log("Submitting initial NAV of $1.00 to NAVOracle...");
    const tx = await navOracle.connect(deployer).submitNAV(
        assetId,
        nav,
        Math.floor(Date.now() / 1000), // valuationDate
        hre.ethers.id("RICS_APPRAISAL_DOC"), // documentHash
        0 // ValuationMethod.FULL_APPRAISAL (index 0)
    );
    const receipt = await tx.wait();

    console.log("✅ NAV configured successfully.");

    await saveWorkflowResult(6, {
        name: "Oracle / NAV Config",
        txHash: receipt.hash,
        contract: deployment.contracts.azureToken,
        details: `NAV: $1.00/token, Source: RICS Appraisal`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
