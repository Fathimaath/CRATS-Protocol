const { getDeploymentInfo } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 3: SBT Minting (L1)
 * IdentitySBT is actually minted during registerIdentity, but this script 
 * confirms the mint and displays details.
 */
async function main() {
    console.log("\n--- Step 3: SBT Minting (L1) ---");
    const deployment = await getDeploymentInfo();
    const [, issuer] = await hre.ethers.getSigners();

    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    const tokenId = await identitySBT.tokenIdOf(issuer.address);
    if (tokenId == 0) {
        throw new Error("Issuer not registered. Run Step 1 first.");
    }

    const identity = await identitySBT.getIdentity(tokenId);

    console.log("SBT Details:");
    console.log(" - Token ID:", tokenId.toString());
    console.log(" - Role:", identity.role);
    console.log(" - Jurisdiction:", identity.jurisdiction);
    console.log(" - Status:", identity.status == 2 ? "VERIFIED" : identity.status);
    console.log(" - DID:", identity.did);

    console.log("✅ IdentitySBT confirmed for issuer.");
}

main().catch(console.error);
