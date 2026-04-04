const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 4: Asset Tokenization (L2)
 * Deploys the AssetToken for "Azure Manor".
 */
async function main() {
    console.log("\n--- Step 4: Asset Tokenization (L2) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    const assetFactory = await hre.ethers.getContractAt("AssetFactory", deployment.contracts.assetFactory);
    
    // Check if already deployed
    if (deployment.contracts.azureToken) {
        console.log(`ℹ️ Asset already tokenized at: ${deployment.contracts.azureToken}. Skipping.`);
        return;
    }

    // Ensure issuer is approved
    const isApproved = await assetFactory.isIssuerApproved(issuer.address);
    if (!isApproved) {
        console.log("Approving issuer in AssetFactory...");
        await (await assetFactory.connect(deployer).approveIssuer(issuer.address)).wait();
    }
    
    // Deployment Parameters
    const assetParams = {
        name: "Azure Manor",
        symbol: "AZURE",
        initialSupply: hre.ethers.parseEther("10000000"), // 10M tokens
        categoryId: hre.ethers.id("REAL_ESTATE"),
        complianceModule: deployment.contracts.complianceModule,
        assetRegistry: deployment.contracts.assetRegistry,
    };

    console.log("Deploying Asset Token via Factory...");
    const tx = await assetFactory.connect(issuer).deployAsset(assetParams);
    const receipt = await tx.wait();

    // Find AssetDeployed event
    const event = receipt.logs.find(log => {
        try {
            return assetFactory.interface.parseLog(log).name === "AssetDeployed";
        } catch (e) {
            return false;
        }
    });

    const assetTokenAddress = assetFactory.interface.parseLog(event).args.assetToken;
    console.log("✅ Asset Token deployed at:", assetTokenAddress);

    // Save to deployment info
    deployment.contracts.azureToken = assetTokenAddress;
    await saveDeploymentInfo(deployment);

    await saveWorkflowResult(4, {
        name: "Asset Tokenization",
        txHash: receipt.hash || tx.hash,
        contract: assetTokenAddress,
        details: `Token: Azure Manor (AZURE), Supply: 10M`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
