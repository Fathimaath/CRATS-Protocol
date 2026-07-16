const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Step 17: Carbon Asset Tokenization (L2) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    const assetFactory = await hre.ethers.getContractAt("AssetFactory", deployment.contracts.assetFactory);
    const carbonMetadataStore = await hre.ethers.getContractAt("CarbonAssetMetadataStore", deployment.contracts.carbonMetadataStore);
    const carbonBatchManager = await hre.ethers.getContractAt("CarbonBatchManager", deployment.contracts.carbonBatchManager);
    const assetRegistry = await hre.ethers.getContractAt("AssetRegistry", deployment.contracts.assetRegistry);
    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);

    // Check if issuer is approved
    const isApproved = await assetFactory.isIssuerApproved(issuer.address);
    if (!isApproved) {
        console.log("Approving issuer in AssetFactory...");
        await (await assetFactory.connect(deployer).approveIssuer(issuer.address)).wait();
    }

    // Deploy Carbon Asset Token
    console.log("Tokenizing Carbon Asset via AssetFactory...");
    const CATEGORY_ID = hre.ethers.id("CARBON_CREDIT");
    const tx = await assetFactory.connect(issuer).deployAsset(
        "Verra VCS Amazon Carbon",
        "VCARBON",
        hre.ethers.parseEther("100000"), // 100k tCO2e supply
        CATEGORY_ID
    );
    const receipt = await tx.wait();

    // Find AssetDeployed event
    const event = receipt.logs.find(log => {
        try {
            return assetFactory.interface.parseLog(log).name === "AssetDeployed";
        } catch (e) {
            return false;
        }
    });

    const tokenAddress = assetFactory.interface.parseLog(event).args.token;
    console.log("✅ Carbon Asset Token deployed at:", tokenAddress);
    deployment.contracts.carbonToken = tokenAddress;
    await saveDeploymentInfo(deployment);

    // Set Asset Archetype in AssetRegistry
    console.log("Registering asset archetype (STATIC_HOLD = 0) in AssetRegistry...");
    await (await assetRegistry.connect(deployer).setAssetArchetype(tokenAddress, 0)).wait();

    // Link Metadata Store in AssetRegistry
    await (await assetRegistry.connect(deployer).setCarbonMetadataStore(tokenAddress, await carbonMetadataStore.getAddress())).wait();

    // Add Batch in Batch Manager
    console.log("Adding carbon credit batch in Batch Manager...");
    const serialStart = "VCU-1000001";
    const serialEnd = "VCU-1100000";
    const totalCredits = 100000;
    const vintage = 2023;
    await (await carbonBatchManager.addBatch(tokenAddress, totalCredits, vintage, serialStart, serialEnd)).wait();
    console.log(`  Added Batch: ${serialStart} to ${serialEnd} (${totalCredits} credits, vintage ${vintage})`);

    // Register Metadata in Metadata Store
    console.log("Registering metadata in CarbonAssetMetadataStore...");
    const meta = {
        registryType: 0, // VERRA
        registryProjectId: "VCS-1360",
        registryBatchId: "VCS-BATCH-2023",
        registryUrl: "https://registry.verra.org/projects/VCS-1360",
        creditType: 1, // REMOVAL
        syncStatus: 2, // IMPORTED
        projectName: "Amazon Forestry Preservation",
        projectType: 1, // AFOLU_ARR
        methodology: "VM0048",
        vintage: vintage,
        country: "BR",
        areaHectares: 500000,
        serialRangeStart: serialStart,
        serialRangeEnd: serialEnd,
        serialCommitment: hre.ethers.solidityPackedKeccak256(["string", "string"], [serialStart, serialEnd]),
        totalCredits: totalCredits,
        availableCredits: totalCredits,
        reservedCredits: 0,
        retiredCredits: 0,
        verificationReportHash: hre.ethers.id("VERIFICATION_REPORT_HASH"),
        validationReportHash: hre.ethers.id("VALIDATION_REPORT_HASH"),
        monitoringReportHash: hre.ethers.id("MONITORING_REPORT_HASH"),
        issuanceCertificateHash: hre.ethers.id("ISSUANCE_CERTIFICATE_HASH"),
        immobilizationProofHash: hre.ethers.id("IMMOBILIZATION_PROOF_HASH"),
        ccpStatus: 2, // APPROVED
        corsiaEligible: true,
        article6Authorized: true,
        manifestIpfsCid: "QmManifestHashReferencePlaceholder",
        manifestHash: hre.ethers.id("MANIFEST_HASH"),
        coverImageCid: "QmCoverImageHashReferencePlaceholder"
    };
    await (await carbonMetadataStore.connect(deployer).registerCarbonAsset(tokenAddress, meta)).wait();
    console.log("  Registered carbon metadata successfully.");

    // Submit NAV to NAVOracle (using immobilization proof as PoR attestation hash)
    console.log("Configuring NAV weight and submitting initial NAV (USDC value per credit)...");
    const weightConfig = {
        appraisalWeight: 0, // No appraisal for carbon
        dcfWeight: 0,
        incomeWeight: 0,
        compWeight: 100, // 100% market-comparable
        appraisalMaxAge: 0,
        dcfMaxAge: 0,
        incomeMaxAge: 0,
        compMaxAge: 30 * 86400 // 30 days
    };
    const assetId = hre.ethers.zeroPadValue(tokenAddress, 32);
    await (await navOracle.connect(deployer).setWeightConfig(assetId, weightConfig)).wait();

    // Enforce schedule class for CARBON_CREDITS
    const CARBON_CLASS = hre.ethers.id("CARBON_CREDIT");
    await (await navOracle.connect(deployer).setAssetClass(assetId, CARBON_CLASS));
    await (await navOracle.connect(deployer).setAssetClassSchedule(CARBON_CLASS, {
        maxValuationInterval: 30 * 86400,
        warningThreshold: 25 * 86400,
        isActive: true
    })).wait();

    // Submit NAV: $15 per tCO2e credit
    const navValue = hre.ethers.parseEther("15"); 
    await (await navOracle.connect(deployer).submitNAV(
        assetId,
        navValue,
        Math.floor(Date.now() / 1000),
        meta.immobilizationProofHash,
        3 // ValuationMethod.MARKET_COMPARABLE
    )).wait();
    console.log(`  Initial NAV submitted: $15.00`);

    await saveWorkflowResult(17, {
        name: "Carbon Asset Tokenization",
        txHash: receipt.hash || tx.hash,
        contract: tokenAddress,
        details: `Token VCARBON, Serial range: ${serialStart} - ${serialEnd}, Price: $15.00`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
