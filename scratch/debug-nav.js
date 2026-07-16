const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deployment = JSON.parse(fs.readFileSync("deployments/localhost-deployment.json", "utf8"));
    const contracts = deployment.contracts;

    const navOracle = await hre.ethers.getContractAt("NAVOracle", contracts.navOracle);
    const assetId = hre.ethers.zeroPadValue(contracts.azureToken, 32);

    console.log("Asset ID:", assetId);
    
    // Check active submission
    const activeSub = await navOracle.activeSubmission(assetId);
    console.log("Active Submission Value:", hre.ethers.formatEther(activeSub.assetValue));
    console.log("Active Submission Date:", activeSub.valuationDate.toString());
    console.log("Active Submission SubmittedAt:", activeSub.submittedAt.toString());
    console.log("Active Submission Method:", activeSub.method.toString());

    // Check weight config
    const config = await navOracle.weightConfigs(assetId);
    console.log("Weight Config:");
    console.log("  appraisalWeight:", config.appraisalWeight.toString());
    console.log("  appraisalMaxAge:", config.appraisalMaxAge.toString());

    // Try calling getWeightedNAV
    try {
        const weighted = await navOracle.getWeightedNAV(assetId);
        console.log("Weighted NAV:", hre.ethers.formatEther(weighted));
    } catch (e) {
        console.log("getWeightedNAV reverted with:", e.message);
    }
}

main().catch(console.error);
