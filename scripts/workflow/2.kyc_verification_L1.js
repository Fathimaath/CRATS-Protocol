const { getDeploymentInfo } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 2: KYC Verification (L1)
 * Simulations verification by a KYC provider (usually the deployer in test).
 */
async function main() {
    console.log("\n--- Step 2: KYC Verification (L1) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    const tokenId = await identitySBT.tokenIdOf(issuer.address);
    if (tokenId == 0) {
        throw new Error("Issuer not registered. Run Step 1 first.");
    }
    console.log("Identity Token ID:", tokenId.toString());

    // Update status to VERIFIED (2)
    const statusVerified = 2;
    console.log("Updating identity status to VERIFIED...");
    const tx = await identitySBT.updateStatus(tokenId, statusVerified);
    await tx.wait();

    console.log("✅ Issuer KYC verified successfully.");
}

main().catch(console.error);
