const { getDeploymentInfo } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 1: Issuer Onboarding / Identity Registry (L1)
 * Registers the issuer's wallet in the IdentityRegistry.
 */
async function main() {
    console.log("\n--- Step 1: Issuer Onboarding / Identity Registry (L1) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();
    
    console.log("Issuer Wallet:", issuer.address);

    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    
    const roleIssuer = 4;
    const jurisdiction = 826;
    const did = "did:crats:nexus-realty";
    const didHash = hre.ethers.id(did);
    const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

    console.log("Registering identity for issuer...");
    const tx = await identityRegistry.registerIdentity(
        issuer.address,
        roleIssuer,
        jurisdiction,
        didHash,
        did,
        expiresAt
    );
    await tx.wait();
    
    console.log("✅ Issuer identity registered successfully.");
}

main().catch(console.error);
