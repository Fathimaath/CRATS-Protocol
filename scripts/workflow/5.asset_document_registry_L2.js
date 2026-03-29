const { getDeploymentInfo } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 5: Asset Document Registry (L2)
 * Adds documents to the AssetRegistry for "Azure Manor".
 */
async function main() {
    console.log("\n--- Step 5: Asset Document Registry (L2) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    if (!deployment.contracts.azureToken) {
        throw new Error("Azure Token not deployed. Run Step 4 first.");
    }

    const assetRegistry = await hre.ethers.getContractAt("AssetRegistry", deployment.contracts.assetRegistry);
    
    const documents = [
        {
            docType: "TITLE_DEED",
            docHash: hre.ethers.id("CONTENT_OF_TITLE_DEED"),
            docURI: "ipfs://QmAzureTitleDeed",
            timestamp: Math.floor(Date.now() / 1000)
        },
        {
            docType: "APPRAISAL",
            docHash: hre.ethers.id("CONTENT_OF_APPRAISAL"),
            docURI: "ipfs://QmAzureAppraisal",
            timestamp: Math.floor(Date.now() / 1000)
        }
    ];

    console.log("Registering documents for Azure Manor...");
    const tx = await assetRegistry.connect(issuer).registerDocuments(
        deployment.contracts.azureToken,
        documents
    );
    await tx.wait();

    console.log("✅ Documents registered successfully.");
}

main().catch(console.error);
