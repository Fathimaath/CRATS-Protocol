const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deploymentFile = path.resolve(__dirname, "../deployments/sepolia-deployment.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const [deployer] = await hre.ethers.getSigners();
    
    console.log("Deployer:", deployer.address);
    console.log("NAVOracle:", deployment.contracts.navOracle);
    
    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);
    
    const valuerRole = hre.ethers.id("VALUER_ROLE");
    const adminRole = "0x0000000000000000000000000000000000000000000000000000000000000000";
    
    const hasValuer = await navOracle.hasRole(valuerRole, deployer.address);
    const hasAdmin = await navOracle.hasRole(adminRole, deployer.address);
    const paused = await navOracle.paused();
    
    console.log("Has VALUER_ROLE:", hasValuer);
    console.log("Has DEFAULT_ADMIN_ROLE:", hasAdmin);
    console.log("Is Paused:", paused);
    
    try {
        const dummyAssetId = hre.ethers.id("MOCK_ASSET_" + Date.now());
        const dummyValue = hre.ethers.parseUnits("1.50", 18);
        const valuationDate = Math.floor(Date.now() / 1000);
        const documentHash = hre.ethers.id("RICS_APPRAISAL_DOC_" + Date.now());
        
        console.log("Simulating call to submitNAV...");
        await navOracle.submitNAV.staticCall(
            dummyAssetId,
            dummyValue,
            valuationDate,
            documentHash,
            0
        );
        console.log("Static call succeeded!");
    } catch (err) {
        console.error("Static call failed!");
        console.error(err.message);
    }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
