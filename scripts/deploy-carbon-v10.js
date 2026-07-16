const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n========================================================");
    console.log("   CRATS PROTOCOL - CARBON CREDIT EXTENSION (v10.0.0)");
    console.log("========================================================\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name === "unknown" ? "localhost" : hre.network.name;
    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);

    if (!fs.existsSync(deploymentFile)) {
        throw new Error(`Deployment file not found for network ${network}`);
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const deployed = deployment.contracts;

    // Load existing contracts
    const assetFactory = await hre.ethers.getContractAt("AssetFactory", deployed.assetFactory);
    const assetRegistry = await hre.ethers.getContractAt("AssetRegistry", deployed.assetRegistry);
    const syncManager = await hre.ethers.getContractAt("OwnershipSyncManager", deployed.syncManager);

    // 1. Deploy DMSRegistry (Optional)
    console.log("Deploying DMSRegistry...");
    const DMSRegistry = await hre.ethers.getContractFactory("DMSRegistry");
    const dmsRegistry = await DMSRegistry.deploy(deployer.address);
    await dmsRegistry.waitForDeployment();
    deployed.dmsRegistry = await dmsRegistry.getAddress();
    console.log("  ✅ DMSRegistry:", deployed.dmsRegistry);

    // 2. Deploy SanctionsOracle
    console.log("Deploying SanctionsOracle...");
    const SanctionsOracle = await hre.ethers.getContractFactory("SanctionsOracle");
    const sanctionsOracle = await SanctionsOracle.deploy(deployer.address);
    await sanctionsOracle.waitForDeployment();
    deployed.sanctionsOracle = await sanctionsOracle.getAddress();
    console.log("  ✅ SanctionsOracle:", deployed.sanctionsOracle);

    // 3. Deploy CarbonCreditPlugin (STATIC_HOLD)
    console.log("Deploying CarbonCreditPlugin...");
    const CarbonCreditPlugin = await hre.ethers.getContractFactory("CarbonCreditPlugin");
    const carbonCreditPlugin = await CarbonCreditPlugin.deploy(deployer.address);
    await carbonCreditPlugin.waitForDeployment();
    deployed.carbonCreditPlugin = await carbonCreditPlugin.getAddress();
    console.log("  ✅ CarbonCreditPlugin:", deployed.carbonCreditPlugin);

    // Link optional DMSRegistry to plugin
    await (await carbonCreditPlugin.setDMSRegistry(deployed.dmsRegistry)).wait();
    console.log("  Linked DMSRegistry to CarbonCreditPlugin");

    // 4. Deploy CarbonRetirementPlugin (CONSUMABLE)
    console.log("Deploying CarbonRetirementPlugin...");
    const CarbonRetirementPlugin = await hre.ethers.getContractFactory("CarbonRetirementPlugin");
    const carbonRetirementPlugin = await CarbonRetirementPlugin.deploy(deployer.address);
    await carbonRetirementPlugin.waitForDeployment();
    deployed.carbonRetirementPlugin = await carbonRetirementPlugin.getAddress();
    console.log("  ✅ CarbonRetirementPlugin:", deployed.carbonRetirementPlugin);

    // Link optional DMSRegistry to retirement plugin
    await (await carbonRetirementPlugin.setDMSRegistry(deployed.dmsRegistry)).wait();
    console.log("  Linked DMSRegistry to CarbonRetirementPlugin");

    // 5. Deploy CarbonBatchManager
    console.log("Deploying CarbonBatchManager...");
    const CarbonBatchManager = await hre.ethers.getContractFactory("CarbonBatchManager");
    const carbonBatchManager = await CarbonBatchManager.deploy(deployer.address);
    await carbonBatchManager.waitForDeployment();
    deployed.carbonBatchManager = await carbonBatchManager.getAddress();
    console.log("  ✅ CarbonBatchManager:", deployed.carbonBatchManager);

    // 6. Deploy CarbonAssetMetadataStore
    console.log("Deploying CarbonAssetMetadataStore...");
    const CarbonAssetMetadataStore = await hre.ethers.getContractFactory("CarbonAssetMetadataStore");
    const carbonMetadataStore = await CarbonAssetMetadataStore.deploy(deployer.address);
    await carbonMetadataStore.waitForDeployment();
    deployed.carbonMetadataStore = await carbonMetadataStore.getAddress();
    console.log("  ✅ CarbonAssetMetadataStore:", deployed.carbonMetadataStore);

    // 7. Deploy CarbonRetirementManager
    console.log("Deploying CarbonRetirementManager...");
    const CarbonRetirementManager = await hre.ethers.getContractFactory("CarbonRetirementManager");
    const carbonRetirementManager = await CarbonRetirementManager.deploy(
        deployer.address,
        deployed.carbonBatchManager,
        deployed.carbonMetadataStore,
        deployed.syncManager
    );
    await carbonRetirementManager.waitForDeployment();
    deployed.carbonRetirementManager = await carbonRetirementManager.getAddress();
    console.log("  ✅ CarbonRetirementManager:", deployed.carbonRetirementManager);

    // 8. Deploy GovernanceMultisig
    console.log("Deploying GovernanceMultisig...");
    const GovernanceMultisig = await hre.ethers.getContractFactory("GovernanceMultisig");
    const governanceMultisig = await GovernanceMultisig.deploy(
        deployer.address,
        [deployer.address],
        1, // required signers
        0, // timelock delay (0 for workflow/testing)
        deployer.address // emergency guardian
    );
    await governanceMultisig.waitForDeployment();
    deployed.governanceMultisig = await governanceMultisig.getAddress();
    console.log("  ✅ GovernanceMultisig:", deployed.governanceMultisig);

    // --- Wire and Link everything ---
    console.log("\nWiring Roles and Plugin Registrations...");

    // Register CarbonCreditPlugin in AssetFactory
    const CARBON_CREDIT = hre.ethers.id("CARBON_CREDIT");
    await (await assetFactory.registerPlugin(CARBON_CREDIT, deployed.carbonCreditPlugin)).wait();
    console.log("  Registered CarbonCreditPlugin on AssetFactory");

    // Register CarbonRetirementPlugin in AssetFactory
    const CARBON_RETIREMENT = hre.ethers.id("CARBON_RETIREMENT");
    await (await assetFactory.registerPlugin(CARBON_RETIREMENT, deployed.carbonRetirementPlugin)).wait();
    console.log("  Registered CarbonRetirementPlugin on AssetFactory");

    // Authorize CarbonRetirementManager on CarbonBatchManager
    await (await carbonBatchManager.setOperator(deployed.carbonRetirementManager, true)).wait();
    console.log("  Authorized CarbonRetirementManager on CarbonBatchManager");

    // Authorize CarbonRetirementManager on CarbonAssetMetadataStore
    const RETIREMENT_MANAGER_ROLE = await carbonMetadataStore.RETIREMENT_MANAGER_ROLE();
    await (await carbonMetadataStore.grantRole(RETIREMENT_MANAGER_ROLE, deployed.carbonRetirementManager)).wait();
    console.log("  Granted RETIREMENT_MANAGER_ROLE to CarbonRetirementManager");

    // Authorize CarbonRetirementManager on OwnershipSyncManager
    const syncManagerReason = await syncManager.CARBON_RETIREMENT();
    await (await syncManager.authorizeModule(deployed.carbonRetirementManager, syncManagerReason)).wait();
    console.log("  Authorized CarbonRetirementManager on OwnershipSyncManager with reason code CARBON_RETIREMENT");

    // Save Deployment JSON
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log("\n💾 Deployment progress successfully saved to:", path.basename(deploymentFile));
    console.log("========================================================\n");
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
