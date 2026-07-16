const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Step 21: Carbon Credit Retirement Flow (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor, buyer] = await hre.ethers.getSigners();

    if (!deployment.contracts.carbonVault) {
        throw new Error("Carbon Vault not deployed. Run Step 18 first.");
    }

    const carbonVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.carbonVault);
    const carbonRetirementManager = await hre.ethers.getContractAt("CarbonRetirementManager", deployment.contracts.carbonRetirementManager);
    const carbonMetadataStore = await hre.ethers.getContractAt("CarbonAssetMetadataStore", deployment.contracts.carbonMetadataStore);

    // Let's have the Buyer retire 100 shares of carbon credits they acquired
    const retireShares = hre.ethers.parseEther("100");
    const beneficiary = "CleanPlanet Corp";
    const purpose = "Scope 1 offsetting FY2026";

    console.log(`1. Buyer requests carbon credit retirement for ${hre.ethers.formatEther(retireShares)} shares...`);
    const tx = await carbonRetirementManager.connect(buyer).requestRetirement(
        deployment.contracts.carbonVault,
        retireShares,
        beneficiary,
        purpose
    );
    const receipt = await tx.wait();

    // Find RetirementRequested event
    const event = receipt.logs.find(log => {
        try {
            return carbonRetirementManager.interface.parseLog(log).name === "RetirementRequested";
        } catch (e) {
            return false;
        }
    });

    const parsedEvent = carbonRetirementManager.interface.parseLog(event);
    const retirementId = parsedEvent.args.id;
    const credits = parsedEvent.args.credits;
    console.log(`  Retirement Request created. ID: ${retirementId.toString()}, Credits: ${hre.ethers.formatEther(credits)} tCO2e`);

    // Verify status is REQUESTED (0)
    let record = await carbonRetirementManager.getRetirementRecord(retirementId);
    console.log("  Initial Status:", record.status === 0 ? "REQUESTED" : record.status.toString());

    // 2. Simulate off-chain registry verification by operator
    console.log("2. Simulating off-chain registry confirmation by REGISTRY_OPERATOR...");
    
    // Grant registry operator role to deployer if not granted
    const OPERATOR_ROLE = await carbonRetirementManager.REGISTRY_OPERATOR_ROLE();
    const hasRole = await carbonRetirementManager.hasRole(OPERATOR_ROLE, deployer.address);
    if (!hasRole) {
        await (await carbonRetirementManager.connect(deployer).grantRole(OPERATOR_ROLE, deployer.address)).wait();
    }

    // Set SyncVault ADMIN role to CarbonRetirementManager so it can call burnShares
    const DEFAULT_ADMIN_ROLE = await carbonVault.DEFAULT_ADMIN_ROLE();
    const hasVaultAdmin = await carbonVault.hasRole(DEFAULT_ADMIN_ROLE, deployment.contracts.carbonRetirementManager);
    if (!hasVaultAdmin) {
        console.log("  Granting DEFAULT_ADMIN_ROLE on SyncVault to CarbonRetirementManager...");
        await (await carbonVault.connect(issuer).grantRole(DEFAULT_ADMIN_ROLE, deployment.contracts.carbonRetirementManager)).wait();
    }

    const registryTxHash = hre.ethers.id("MOCK_REGISTRY_RETIREMENT_TX");
    const certHash = hre.ethers.id("MOCK_RETIREMENT_CERTIFICATE");
    const allocatedSerialStart = "VCU-1000001";
    const allocatedSerialEnd = "VCU-1000100";

    const confirmTx = await carbonRetirementManager.connect(deployer).confirmRetirement(
        retirementId,
        allocatedSerialStart,
        allocatedSerialEnd,
        registryTxHash,
        certHash
    );
    await confirmTx.wait();
    console.log("  ✅ Retirement confirmed by registry operator.");

    // Verify shares were burned and metadata store updated
    record = await carbonRetirementManager.getRetirementRecord(retirementId);
    console.log("  Final Status:", record.status === 2 ? "CONFIRMED" : record.status.toString());
    console.log("  Allocated Serial Range:", record.serialStart, "-", record.serialEnd);

    const buyerVaultBal = await carbonVault.balanceOf(buyer.address);
    console.log("  Buyer remaining vault shares:", hre.ethers.formatEther(buyerVaultBal), "vCARBON");

    const storeMetadata = await carbonMetadataStore.getCarbonMetadata(deployment.contracts.carbonToken);
    console.log("Metadata Store accounting:");
    console.log("  Available Credits:", hre.ethers.formatEther(storeMetadata.availableCredits));
    console.log("  Reserved Credits:", hre.ethers.formatEther(storeMetadata.reservedCredits));
    console.log("  Retired Credits:", hre.ethers.formatEther(storeMetadata.retiredCredits));

    await saveWorkflowResult(21, {
        name: "Carbon Retirement",
        txHash: confirmTx.hash,
        contract: deployment.contracts.carbonRetirementManager,
        details: `Retired ${hre.ethers.formatEther(credits)} tCO2e credits; Serial range: ${allocatedSerialStart} - ${allocatedSerialEnd}`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
