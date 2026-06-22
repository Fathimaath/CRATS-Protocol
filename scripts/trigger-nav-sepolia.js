const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deploymentFile = path.resolve(__dirname, "../deployments/sepolia-deployment.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const [deployer] = await hre.ethers.getSigners();
    
    console.log("Using deployer address:", deployer.address);
    console.log("NAVOracle address:", deployment.contracts.navOracle);
    
    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);
    
    // Generate unique mock assetId and values
    const dummyAssetId = hre.ethers.id("MOCK_ASSET_" + Date.now());
    const dummyValue = hre.ethers.parseUnits("1.50", 18);
    const valuationDate = Math.floor(Date.now() / 1000);
    const documentHash = hre.ethers.id("RICS_APPRAISAL_DOC_" + Date.now());
    
    console.log(`Submitting NAV of $1.50 for asset ID ${dummyAssetId}...`);
    const tx = await navOracle.connect(deployer).submitNAV(
        dummyAssetId,
        dummyValue,
        valuationDate,
        documentHash,
        0 // ValuationMethod.FULL_APPRAISAL
    );
    
    console.log("Transaction Hash:", tx.hash);
    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
