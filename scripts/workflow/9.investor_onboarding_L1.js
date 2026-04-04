const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 9: Investor Onboarding (L1)
 * Registers the investor's wallet in the IdentityRegistry.
 */
async function main() {
    console.log("\n--- Step 9: Investor Onboarding (L1) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, , investor] = await hre.ethers.getSigners(); // Signer 2
    
    console.log("Investor Wallet:", investor.address);

    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    
    // ROLE_INVESTOR = 1 (from CRATSConfig)
    // Jurisdiction = 250 (France - example)
    const roleInvestor = 1;
    const jurisdiction = 250;
    const did = "did:crats:investor-sarah";
    const didHash = hre.ethers.id(did);
    const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

    console.log("Registering identity for investor...");
    const tx = await identityRegistry.registerIdentity(
        investor.address,
        roleInvestor,
        jurisdiction,
        didHash,
        did,
        expiresAt
    );
    await tx.wait();
    
    console.log("✅ Investor KYC verified and SBT active.");

    await saveWorkflowResult(10, {
        name: "Investor SBT Minting",
        txHash: tx.hash,
        contract: deployment.contracts.identitySBT,
        details: `Investor Status: VERIFIED`,
        layer: "L1"
    });

    await saveWorkflowResult(9, {
        name: "Investor Onboarding",
        txHash: tx.hash,
        contract: deployment.contracts.identityRegistry,
        details: `Investor: ${investor.address}`,
        layer: "L1"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
