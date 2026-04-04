const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
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

    const statusVerified = 2;

    // Check current status
    const identityData = await identitySBT.getIdentity(tokenId);
    if (identityData.status == statusVerified) {
        console.log(`ℹ️ Issuer already VERIFIED. Skipping.`);
        return;
    }

    console.log("Updating identity status to VERIFIED...");
    const tx = await identitySBT.connect(deployer).updateStatus(tokenId, statusVerified);
    const receipt = await tx.wait();

    console.log("✅ Issuer KYC verified successfully.");

    await saveWorkflowResult(2, {
        name: "KYC Verification",
        txHash: receipt.hash || tx.hash,
        contract: deployment.contracts.identitySBT,
        details: `Issuer Verified (Token ID: ${tokenId})`,
        layer: "L1"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
