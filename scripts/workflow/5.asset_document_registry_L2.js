const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
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

    console.log("Registering and verifying documents for Azure Manor...");
    let lastReceipt;
    for (const doc of documents) {
        let exists = false;
        try {
            await assetRegistry.getDocument(doc.docHash);
            exists = true;
        } catch (e) {
            // Not found, proceed with upload
        }

        if (exists) {
            console.log(` ℹ️ Document ${doc.docType} already registered. Skipping.`);
            continue;
        }

        console.log(` - Uploading ${doc.docType} (${doc.docHash})...`);
        const tx = await assetRegistry.connect(deployer).uploadDocument(
            doc.docHash,
            doc.docType,
            "0x"
        );
        lastReceipt = await tx.wait();

        console.log(` - Verifying ${doc.docType}...`);
        const verifyTx = await assetRegistry.connect(deployer).verifyDocument(doc.docHash);
        await verifyTx.wait();
    }

    console.log("✅ Documents registered and verified successfully.");

    await saveWorkflowResult(5, {
        name: "Asset Document Registry",
        txHash: lastReceipt ? lastReceipt.hash : "0x0000000000000000000000000000000000000000000000000000000000000000",
        contract: deployment.contracts.azureToken,
        details: `Registered: PropTitle.pdf, Appr.pdf`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
