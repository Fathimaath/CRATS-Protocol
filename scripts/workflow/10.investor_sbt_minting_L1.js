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
    if (tokenId === 0n || tokenId === 0) {
        console.log("❌ Investor not registered. Run Step 9 first.");
        return;
    }
    console.log("Investor Token ID:", tokenId.toString());

    const identityData = await identitySBT.getIdentity(tokenId);
    if (identityData.status === 2n || identityData.status === 2) {
        console.log("ℹ️ Investor status is already VERIFIED. Skipping.");
        return;
    }

    // Update status to VERIFIED (2)
    const statusVerified = 2;
    console.log("Updating investor status to VERIFIED...");
    const tx = await identitySBT.updateStatus(tokenId, statusVerified);
    await tx.wait();

    console.log("✅ Investor KYC verified and SBT active.");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
