const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 1: Issuer Onboarding / Identity Registry (L1)
 * Registers the issuer's wallet in the IdentityRegistry.
 */
async function main() {
    console.log("\n--- Step 1: Issuer Onboarding / Identity Registry (L1) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();
    
    console.log("Admin (KYC Provider):", deployer.address);
    console.log("Issuer Wallet:", issuer.address);

    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    // Check if already registered
    const existingTokenId = await identitySBT.tokenIdOf(issuer.address);
    if (existingTokenId != 0) {
        console.log(`ℹ️ Issuer already registered with Token ID: ${existingTokenId}. Skipping.`);
        return;
    }
    
    const roleIssuer = 4;
    const jurisdiction = 826;
    const did = "did:crats:nexus-realty";
    const didHash = hre.ethers.id(did);
    const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

    console.log("Registering identity for issuer...");
    const tx = await identityRegistry.connect(deployer).registerIdentity(
        issuer.address,
        roleIssuer,
        jurisdiction,
        didHash,
        did,
        expiresAt
    );
    const receipt = await tx.wait();
    console.log("✅ Issuer identity registered successfully.");

    await saveWorkflowResult(1, {
        name: "Issuer Onboarding",
        txHash: receipt.hash || tx.hash,
        contract: deployment.contracts.identityRegistry,
        details: `Issuer: ${issuer.address}`,
        layer: "L1"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
