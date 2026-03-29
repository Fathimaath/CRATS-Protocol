const { getDeploymentInfo, saveDeploymentInfo } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 8: Listing / Creating Vault Contract (L3)
 * Deploys a SyncVault for the "Azure Manor" asset.
 */
async function main() {
    console.log("\n--- Step 8: Listing / Creating Vault Contract (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    if (!deployment.contracts.azureToken) {
        throw new Error("Azure Token not deployed. Run Step 4 first.");
    }

    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployment.contracts.vaultFactory);
    
    const categoryId = hre.ethers.id("REAL_ESTATE");
    
    console.log("Creating SyncVault for AZURE...");
    const tx = await vaultFactory.connect(issuer).createSyncVault(
        deployment.contracts.azureToken,
        "Azure Manor Vault",
        "vAZURE",
        categoryId
    );
    const receipt = await tx.wait();

    // Find VaultCreated event
    const event = receipt.logs.find(log => {
        try {
            return vaultFactory.interface.parseLog(log).name === "VaultCreated";
        } catch (e) {
            return false;
        }
    });

    const vaultAddress = vaultFactory.interface.parseLog(event).args.vault;
    console.log("✅ SyncVault deployed at:", vaultAddress);

    // Save to deployment info
    deployment.contracts.azureVault = vaultAddress;
    await saveDeploymentInfo(deployment);
}

main().catch(console.error);
