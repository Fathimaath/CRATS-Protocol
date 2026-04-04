const { getDeploymentInfo } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 10: Investor SBT Minting (L1)
 * Confirms and updates status for investor.
 */
async function main() {
    console.log("\n--- Step 10: Investor SBT Minting (L1) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, , investor] = await hre.ethers.getSigners();

    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    const tokenId = await identitySBT.tokenIdOf(investor.address);
    console.log("Investor Token ID:", tokenId.toString());

    // Update status to VERIFIED (2)
    const statusVerified = 2;
    console.log("Updating investor status to VERIFIED...");
    const tx = await identitySBT.updateStatus(tokenId, statusVerified);
    await tx.wait();

    console.log("✅ Investor KYC verified and SBT active.");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
